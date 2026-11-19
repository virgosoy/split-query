# 06: PWA 离线

**What to build:** manifest（名称/图标/standalone）、service worker（cache-first 缓存 app shell 与静态资源）、iOS 相关 meta（apple-touch-icon、mobile-web-app-capable 等），使应用安装到主屏后离线可用。

**Blocked by:** 01

**Status:** resolved

- [x] manifest + 图标（180/192/512）
- [x] service worker：安装预缓存 shell；导航网络优先；静态资源缓存优先；首屏资源预热（一次在线即离线）
- [x] iOS standalone meta（apple-touch-icon、apple-mobile-web-app-*、mobile-web-app-capable）
- [ ] 离线（飞行模式）刷新页面可用 —— 需真机/浏览器人工验证
