# 0002 Prompt-mode updates with a build-generated service worker

应用装到主屏后，页面可能连续数天不被重载。旧实现在 install 里无条件 `skipWaiting()`：新 Service Worker 立刻接管缓存，但正在运行的旧页面没有任何信号，用户无从知道有新版本，也无法主动切换。更新必须**可见**且**由用户确认**，而不是静默替换。

**决定**：构建时生成 `dist/sw.js`，写入版本 `v<package.version>+<短 commit SHA>` 与完整预缓存清单；install 不再无条件 `skipWaiting`，新 Service Worker 停在 `waiting`，页面仅在存在 `waiting` 时提示「有新版本」。用户点「立即更新」后发 `SKIP_WAITING`，经 `controllerchange` 重载（5 秒兜底）。缓存名带版本，activate 清理旧版本并 `clients.claim()`；全量预缓存取代 warmup，使等待中的新版本离线自足。

**取舍**：备选方案是保留自动 `skipWaiting`，用不进预缓存的 `version.json` 轮询判断版本，发现差异就重载。拒绝它有三个原因：`sw.js` 字节不变时浏览器不会安装新 Service Worker，缓存没有接管者；`version.json` 只能证明「服务器上有新文件」，不能证明「有一份完整、可离线接管的新版本」；旧哈希资源继续只增不减。代价是构建管线多一步、每次部署都改变 `sw.js`，并要自己维护更新状态机的超时与 WebKit 兜底；换来的是「提示 → 确认 → 原子切换」和离线自足。
