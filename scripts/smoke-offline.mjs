/**
 * 离线与 SW 更新管线冒烟检查。
 *
 * 本应用有两条跨层承诺，都没有纯 seam 可测：
 *   1. 「一次在线访问后即可离线」——票 06 曾因预热整批失败而静默失效，直到票 08 才发现。
 *   2. 「新版本先停在 waiting，等用户确认」——票 12 的 prompt 模式；若有人把
 *      无条件 skipWaiting 加回去，更新提示就永远不会出现。
 *
 * 这个脚本用全新 profile 验证：
 *   1. 本地构建时，dist/sw.js 含版本、完整预缓存清单、SKIP_WAITING，且没有无条件 skipWaiting
 *   2. 全新 profile 在线打开一次 → .js 与 .css 已进缓存（全量预缓存生效）
 *   3. 断网刷新 → 应用仍能渲染（离线可用）
 *
 * 用法：
 *   npm run smoke                      # 构建 + 本地预览 + 检查
 *   node scripts/smoke-offline.mjs --url https://virgosoy.github.io/split-query/
 *                                      # 对线上地址检查（不构建、不起预览；跳过 dist 不变量）
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freePort, launch } from './browser.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class SmokeFailure extends Error {}

function fail(message) {
  throw new SmokeFailure(message);
}

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
let url = urlFlag >= 0 ? args[urlFlag + 1] : null;
const localBuild = !url;
let server = null;
let browser = null;

try {
  if (localBuild) {
    verifySwArtifacts();

    const port = await freePort();
    const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
    server = spawn(
      process.execPath,
      [viteBin, 'preview', '--port', String(port), '--strictPort'],
      { stdio: 'ignore' },
    );
    url = `http://127.0.0.1:${port}/`;
    if (!(await waitForHttp(url))) fail(`本地预览没起来（${url}）。是否已构建？先跑 npm run build。`);
  }

  browser = await launch({ url });

  // 1) Service Worker 接管
  const ready = await browser.waitFor(`navigator.serviceWorker.ready.then(() => 'ready')`, {
    awaitPromise: true,
    timeout: 20000,
  });
  if (!ready) fail('Service Worker 未在 20 秒内接管页面。');

  // 2) 一次在线访问后，带哈希的静态资源应已进缓存（即全量预缓存生效）。
  //    要求 .js 与 .css 同时存在：只看「任意 /assets/」会漏掉 CSS 单独失败的部分预缓存。
  const cachedAssets = await browser.waitFor(
    `(async () => {
      const paths = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
      }
      const hasJs = paths.some((p) => p.includes('/assets/') && p.endsWith('.js'));
      const hasCss = paths.some((p) => p.includes('/assets/') && p.endsWith('.css'));
      return hasJs && hasCss ? paths : null;
    })()`,
    { awaitPromise: true, timeout: 15000 },
  );
  if (!cachedAssets) {
    const inventory = await cacheInventory(browser);
    fail(
      '预缓存里缺少完整的 /assets/ 资源（需要 .js 与 .css）——「一次在线即离线」不成立。\n' +
        '  检查 dist/sw.js 的 PRECACHE 是否覆盖全部构建产物。\n' +
        `  当前缓存：${inventory}`,
    );
  }

  // 3) 断网刷新 → 应用仍应渲染（JS 从缓存取到并执行）
  await browser.setOffline(true);
  await browser.reload();
  const rendered = await browser.waitFor(
    `!!document.querySelector('#app .topbar') && !!document.querySelector('#app #usage-btn')`,
    { timeout: 15000 },
  );
  if (!rendered) fail('断网刷新后应用没有渲染出来（离线不可用）。');

  console.log(`OK  离线承诺成立：${url}`);
} catch (error) {
  if (!(error instanceof SmokeFailure)) throw error;
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

/** 构建产物不变量：版本注入、全量预缓存、prompt 模式。 */
function verifySwArtifacts() {
  const distFile = (name) => fileURLToPath(new URL(`../dist/${name}`, import.meta.url));
  if (!existsSync(distFile('sw.js'))) fail('dist/sw.js 不存在；先跑 npm run build。');

  const html = readFileSync(distFile('index.html'), 'utf8');
  const meta = html.match(/<meta name="app-version" content="([^"]+)"/);
  if (!meta) fail('dist/index.html 缺少 app-version meta——版本没有注入。');
  const version = meta[1];
  if (!/^v[^\s"'<>]+\+[^\s"'<>]+$/.test(version)) {
    fail(`版本格式不对：${version}（期望 v<package.version>+<短 SHA>）`);
  }

  const sw = readFileSync(distFile('sw.js'), 'utf8');
  if (!sw.includes(version)) fail(`dist/sw.js 未包含与 index.html 一致的版本 ${version}。`);
  if (!/SKIP_WAITING[\s\S]{0,160}self\.skipWaiting\(\)/.test(sw)) {
    fail('dist/sw.js 缺少 SKIP_WAITING 消息处理器——用户无法确认更新。');
  }
  const skipCount = (sw.match(/self\.skipWaiting\(\)/g) ?? []).length;
  if (skipCount !== 1) {
    fail(
      `self.skipWaiting() 出现 ${skipCount} 次；install 不得无条件 skipWaiting，` +
        '只允许 SKIP_WAITING 处理器调用一次。',
    );
  }

  const precacheMatch = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
  if (!precacheMatch) fail('dist/sw.js 缺少 PRECACHE 清单。');
  let precache;
  try {
    precache = JSON.parse(precacheMatch[1]);
  } catch (error) {
    fail(`dist/sw.js 的 PRECACHE 不是合法 JSON：${error.message}`);
  }
  if (!Array.isArray(precache) || precache.length === 0) fail('PRECACHE 为空。');
  if (new Set(precache).size !== precache.length) fail('PRECACHE 有重复 URL。');
  for (const required of ['./', './index.html']) {
    if (!precache.includes(required)) fail(`PRECACHE 缺少 ${required}。`);
  }
  if (!precache.some((path) => path.endsWith('.js'))) fail('PRECACHE 缺少 JS 资源。');
  if (!precache.some((path) => path.endsWith('.css'))) fail('PRECACHE 缺少 CSS 资源。');

  console.log(`OK  SW 更新管线不变量：${version}，预缓存 ${precache.length} 项`);
}

async function waitForHttp(target) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(target);
      if (response.ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function cacheInventory(page) {
  return page.evaluate(
    `(async () => {
      const rows = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          rows.push(new URL(request.url).pathname + '=' + (response ? (await response.blob()).size : '?'));
        }
      }
      return rows.join(', ') || '(缓存为空)';
    })()`,
    { awaitPromise: true },
  );
}
