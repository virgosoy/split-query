/* split-query service worker（构建生成，勿直接编辑）
 * 源模板：scripts/sw.template.js
 *
 * - 安装：把构建产物全量写入版本化缓存；完成后停在 waiting，等用户确认。
 * - 更新：页面发 SKIP_WAITING 后才调用 skipWaiting()，随后由页面重载。
 * - 导航请求：网络优先（在线取最新 shell），离线回退缓存。
 * - 静态资源：缓存优先（Vite 资源带内容哈希，内容不可变），未命中再取网络并写回。
 */
const VERSION = '__APP_VERSION__';
const CACHE = 'split-query-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  // 清单由构建生成且已去重；addAll 要么全成功、要么安装失败保留旧版本，不会留下半套缓存。
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('split-query-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// 页面确认更新后，让等待中的新 SW 接管。
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copy)));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copy)));
          }
          return res;
        }),
    ),
  );
});
