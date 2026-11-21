/**
 * 离线冒烟检查：本应用的头号承诺是「一次在线访问后即可离线」。
 *
 * 它不属于任何纯 seam，UI 与 Service Worker 又都是"人工验证"，于是这条承诺此前
 * 没有任何自动检查——票 06 的实现从落地起就是坏的（/favicon.ico 的 404 让预热的
 * cache.addAll 整批 reject，又被 catch 吞掉），直到票 08 验收才被发现。这个脚本
 * 补那条盲区，并且红在真缺陷上：
 *
 *   1. 全新 profile 在线打开一次 → 断言 .js 与 .css 已进缓存（预热生效）
 *   2. 同批预热里一个 URL 失败 → 断言好 URL 仍进缓存（逐条容错）
 *   3. 断网刷新 → 断言应用仍能渲染（证明离线可用）
 *
 * 用法：
 *   npm run smoke                      # 构建 + 本地预览 + 检查
 *   node scripts/smoke-offline.mjs --url https://virgosoy.github.io/split-query/
 *                                      # 对线上地址检查（不构建、不起预览）
 */
import { spawn } from 'node:child_process';
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
let server = null;
let browser = null;

try {
  if (!url) {
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

  // 2) 一次在线访问后，带哈希的静态资源应已进缓存（即预热生效）。
  //    要求 .js 与 .css 同时存在：只看「任意 /assets/」会漏掉 CSS 单独失败的部分预热。
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
        '  常见诱因：预热用 cache.addAll（全有或全无），一个 URL 失败就会让整批 reject。\n' +
        '  失败可能是 404（如 /favicon.ico），也可能是重复 URL\n' +
        '  （InvalidStateError: duplicate requests，例如 favicon 与 manifest 都指向 icon-192.png）。\n' +
        `  当前缓存：${inventory}`,
    );
  }

  // 3) 逐条容错：同一批预热里一个 URL 失败，不能拖垮其余 URL。
  //    这是票 10 的核心属性；不能只靠浏览器恰好请求了重复 URL 来间接覆盖。
  const probeGood = await browser.evaluate(
    `(async () => {
      const good = new URL('icon-192.png?warmup-probe=' + Date.now(), location.href).href;
      // 带 credentials 的同源 URL：通过 SW 的同源过滤，但 cache.add 会以 TypeError 拒绝。
      const bad = location.protocol + '//user:pass@' + location.host + '/warmup-probe-missing.js';
      const reg = await navigator.serviceWorker.ready;
      reg.active.postMessage({ type: 'warmup', urls: [good, bad] });
      return good;
    })()`,
    { awaitPromise: true },
  );
  if (!probeGood) fail('无法向 Service Worker 发送预热探测消息（reg.active 为空）。');
  const probeCached = await browser.waitFor(
    `(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        if (await cache.match(${JSON.stringify(probeGood)})) return true;
      }
      return false;
    })()`,
    { awaitPromise: true, timeout: 10000 },
  );
  if (!probeCached) {
    fail(
      '逐条容错失效：同一批预热里有一个失败 URL 时，好 URL 也没进缓存。\n' +
        '  预热必须逐条 cache.add 并各自 catch；cache.addAll 是全有或全无。',
    );
  }

  // 4) 断网刷新 → 应用仍应渲染（JS 从缓存取到并执行）
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
