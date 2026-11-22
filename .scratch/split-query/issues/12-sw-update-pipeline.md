# 12: SW 更新管线（版本注入、全量预缓存、prompt 模式）

**What to build:** 把手写的 Service Worker 改造成「每次构建产出带版本、可原子接管、离线自足」的更新管线：构建生成 `dist/sw.js`（注入 `v<package.version>+<短 commit SHA>` 与完整预缓存清单）；删掉 install 的无条件 `skipWaiting`，新增 `SKIP_WAITING` 消息处理器；activate 按版本名清理旧缓存；全量预缓存取代 warmup；部署 workflow 加 `paths:` 白名单；`npm run smoke` 增加 SW 不变量断言。本票不含更新提示 UI。

**Blocked by:** None（可立即开始）

**Status:** resolved

- [x] `npm run build` 产出 `dist/sw.js`，含版本 `v<package.version>+<短 commit SHA>`；预缓存清单覆盖 `./`、`index.html`、全部 `/assets/*.js` 与 `*.css`、图标、`manifest.json`，且无重复 URL
- [x] `dist/index.html` 带同一版本（`<meta name="app-version" ...>`）；dev 下页面读到 `dev`
- [x] install 不再无条件 `skipWaiting`；有旧 SW 时新 SW 停在 `waiting`；仅 `SKIP_WAITING` 消息到达后 `skipWaiting`
- [x] 缓存名含版本；activate 删除旧 `split-query-*` 缓存并 `clients.claim()`；导航仍网络优先、静态资源仍缓存优先
- [x] 删除 `sw.js` 的 warmup 消息处理器与 `main.ts` 的预热代码；预热相关 smoke 探测一并移除
- [x] 全新 profile 在线打开一次 → 预缓存含 `.js` 与 `.css`；断网刷新仍渲染（`npm run smoke`）
- [x] `npm run smoke` 新增断言：`dist/sw.js` 含版本、完整预缓存、`SKIP_WAITING`，且不含无条件 `skipWaiting`
- [x] 部署 workflow 的 `paths:` 白名单：`src/**`、`public/**`、`index.html`、`vite.config.ts`、`package.json`、`package-lock.json`、`tsconfig.json`、`scripts/**`、workflow 自身；`workflow_dispatch` 仍可手动触发
- [x] `npm run check` 通过（本票不涉及纯 seam，理应无新增测试）

## 背景与取舍

见 `docs/adr/0002-prompt-mode-updates.md`。要点：`waiting` 是「有更新」的唯一真源；等待中的新 SW 必须自带完整离线资源（因此全量预缓存取代 warmup）；版本只随真实产物变化（部署 workflow 白名单避免 docs 提交误报）。

## 实现说明

- **构建**：`npm run build` 变为 `tsc && vite build && node scripts/build-sw.mjs`。
- **`scripts/build-sw.mjs`**：计算 `v${package.version}+${git short sha}`（无 git 时 `nogit`）；替换 `dist/index.html` 的 `__APP_VERSION__` 占位；扫描 `dist/` 生成去重预缓存清单（`./`、`index.html`、`manifest.json`、`icon-*.png`、`assets/**`；排除 `sw.js` 与 `.map`）；由 `scripts/sw.template.js` 生成 `dist/sw.js`。
- **`scripts/sw.template.js`**：install 用 `cache.addAll(PRECACHE)`，**不** `skipWaiting`；只保留 `SKIP_WAITING` 消息处理器；activate 删除非当前版本的 `split-query-*` 缓存后 `clients.claim()`；导航网络优先、静态资源缓存优先不变。
- **删除**：`public/sw.js`（改由构建生成）；`main.ts` 的 warmup 代码；SW 的 warmup 消息处理器；smoke 的逐条容错探测。
- **版本展示准备**：`src/version.ts` 读 `meta[name="app-version"]`，dev 下为 `dev`；`main.ts` 写入 `document.documentElement.dataset.appVersion`，供票 13 的面板使用。
- **部署**：`deploy.yml` 增加 `paths:` 白名单，docs / 票提交不再部署；`workflow_dispatch` 保留。
- **smoke**：本地构建时新增 `dist/sw.js` 不变量（版本一致、`PRECACHE` 非空且无重复、含 `./`/`index.html`/JS/CSS、`SKIP_WAITING` 处理器、`self.skipWaiting()` 仅出现一次）。
- 版本化缓存同时解决了票 10 备注里的「旧哈希资源只增不减」。

## 验证记录（2026-11-22）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 42 个测试全绿（无新增/改动测试） |
| `npm run build` | `dist/sw.js` 生成成功：`v0.1.0+58a7d1a`，预缓存 8 项 |
| `dist/index.html` | `<meta name="app-version" content="v0.1.0+58a7d1a" />` |
| `dist/sw.js` | `PRECACHE` = `./`、`index.html`、`manifest.json`、3 个图标、`assets/*.js`、`assets/*.css`；`self.skipWaiting()` 仅 1 处（消息处理器内） |
| `npm run smoke` | SW 不变量 OK + 离线承诺 OK（全新 profile：一次在线 → `.js`/`.css` 入缓存 → 断网刷新仍渲染） |
| waiting 生命周期（一次性 CDP 脚本，全新 profile） | 初始无 waiting，缓存为旧版本；改 `dist/sw.js` 版本后 `registration.update()` → `updatefound`，新 SW 为 `installed/waiting`，旧 SW 仍 `activated`；发 `SKIP_WAITING` → `controllerchange`，旧缓存删除、新缓存保留 |
| CI `paths` 白名单 | 配置已写入；实际过滤需推送后由 GitHub Actions 验证（`workflow_dispatch` 未改动） |

**观察**：`controllerchange` 后旧缓存的删除可能晚一个短窗口才在 `caches.keys()` 里消失（同次检查在 `controllerchange` 后轮询到删除完成）。票 13 在 `controllerchange` 后立即重载没问题——删除在 activate 的 `waitUntil` 内完成；重载后的新 SW 只使用新版本缓存，旧缓存随后被清掉。

## 备注（本票不做）

- 更新提示 UI、检查时机、应用流程与 WebKit 兜底属于票 13（`Blocked by: 12`）。
- 自动化更新流 smoke（本地起两份构建验证完整点击链路）未纳入；本票只做 SW 不变量与一次性生命周期验收。
