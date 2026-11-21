/* split-query service worker
 * - 安装：预缓存 app shell（static 资源，非哈希）。
 * - 导航请求：网络优先（在线取最新 shell），离线回退缓存。
 * - 静态资源：缓存优先（Vite 资源带内容哈希，内容不可变），未命中再取网络并写回。
 * - 预热：页面首次加载后把已加载的同源资源 URL 发来，逐条写入缓存，
 *   保证「一次在线访问」后即可离线（首屏资源在 SW 注册前已取完，需补缓存）。
 */
const CACHE = 'split-query-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 页面预热：缓存它已成功加载的同源资源（含带哈希的 /assets/*）。
// 逐条加入且各自容错：URL 来自运行时性能条目，不受我们控制（例如浏览器自动请求的
// /favicon.ico），一条失败不能让其余资源一起丢。cache.addAll 是全有或全无，不能用。
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warmup' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => {
    if (typeof u !== 'string') return false;
    try {
      return new URL(u, self.location.origin).origin === self.location.origin;
    } catch {
      return false; // 畸形 URL 直接跳过，不能让一条坏输入中断整个预热
    }
  });
  if (urls.length === 0) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        urls.map((url) =>
          cache.add(url).catch((err) => console.warn('预热失败，跳过该资源', url, err)),
        ),
      ),
    ),
  );
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
