/**
 * 离线冒烟检查：本应用的头号承诺是「一次在线访问后即可离线」。
 *
 * 它不属于任何纯 seam，UI 与 Service Worker 又都是"人工验证"，于是这条承诺此前
 * 没有任何自动检查——票 06 的实现从落地起就是坏的（/favicon.ico 的 404 让预热的
 * cache.addAll 整批 reject，又被 catch 吞掉），直到票 08 验收才被发现。这个脚本
 * 补那条盲区，并且红在真缺陷上：
 *
 *   1. 全新 profile 在线打开一次 → 断言静态资源已进缓存（预热生效）
 *   2. 断网刷新 → 断言应用仍能渲染（证明离线可用）
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

  // 2) 一次在线访问后，带哈希的静态资源应已进缓存（即预热生效）
  const cachedAsset = await browser.waitFor(
    `(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname.includes('/assets/')) return request.url;
        }
      }
      return null;
    })()`,
    { awaitPromise: true, timeout: 15000 },
  );
  if (!cachedAsset) {
    const inventory = await cacheInventory(browser);
    fail(
      '预缓存里没有任何 /assets/ 静态资源——「一次在线即离线」不成立。\n' +
        '  常见诱因：预热用 cache.addAll（全有或全无），某个 URL 失败（如 /favicon.ico 404）\n' +
        '  就会让整批 reject，而错误又被 .catch 吞掉。\n' +
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
