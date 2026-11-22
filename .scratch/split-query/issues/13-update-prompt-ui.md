# 13: 更新提示 UI（圆点、面板、检查与应用）

**What to build:** 顶栏加入更新入口与圆点，点开模态面板显示当前版本与检查状态；启动/回前台自动检查（10 分钟节流、离线跳过），面板打开即手动检查；点「立即更新」让 `waiting` SW 接管并重载。包含 WebKit 兜底与真机验收。

**Blocked by:** 12

**Status:** resolved——本地链路验收通过；iPhone 14 / iOS 16.1.1 真机验收待做

- [x] 顶栏紧凑圆形图标（aria-label「检查更新」），仅 PROD 渲染；存在 `waiting` 时显示圆点，更新完成后圆点消失
- [x] 面板显示当前版本（读 `dist/index.html` 的 meta；dev 不渲染入口）、状态行与主按钮：主按钮在「检查更新 / 检查中… / 立即更新 / 更新中…」间切换；状态行显示「已是最新 / 发现新版本 / 当前离线，无法检查 / 检查失败，请稍后再试 / 更新正在下载，请稍后再试」
- [x] 打开面板：已有 `waiting` → 直接显示「立即更新」；否则在线时自动检查；离线显示「当前离线，无法检查」
- [x] 启动时与 `visibilitychange` 回到前台时自动检查；10 分钟内只自动查一次；离线跳过；手动检查不受节流限制
- [x] 「立即更新」先确认 `registration.waiting`；没有则提示稍后再试且不重载；有则 `SKIP_WAITING` → `controllerchange` → reload；5 秒兜底重载
- [x] 兜底生效：`update()` 15 秒超时；等安装 30 秒；`installed` 后等 `waiting` 2 秒；25ms 轮询；`update()` resolve 后让出宏任务等 `updatefound`
- [x] 更新不触碰 IndexedDB；不保留搜索词与滚动位置；不做二次确认、「稍后/忽略」、清除缓存或重置
- [ ] 人工验收：部署 v1 → 做一次真实应用改动部署 v2 → 回到前台看到圆点 → 立即更新 → 面板版本变化；iPhone 14 / iOS 16.1.1 真机再走一遍
- [x] `npm run check` 与 `npm run smoke` 通过（本票不新增纯 seam；smoke 不因 UI 改动而放宽）

## 实现说明

- **`src/update.ts`**：更新状态机与全部胶水。状态为 `idle / checking / current / available / offline / failed / pending / applying`；`VIEW` 表统一「状态行 + 主按钮」文案。注册 SW 的职责从 `main.ts` 移到这里。
- **自动检查**：`startRegistration()` 后查一次；`visibilitychange` 回到 `visible` 时查；`AUTO_CHECK_INTERVAL_MS = 10 分钟` 节流；离线跳过；失败只 `console.warn`，不动 UI。手动检查（面板打开/点按钮）不经过节流。
- **手动检查**：打开面板时，已有 `waiting` 直接 `available`；离线直接 `offline`；否则自动开始。`checkForWaiting()` 实现「update → 等 installed → 等 waiting」，含 15s/30s/2s/25ms 与让出宏任务的 WebKit 兜底。
- **应用更新**：再次确认 `waiting` → 监听 `controllerchange` 并 reload → 5s 兜底；没有 `waiting` 时只提示，不重载。
- **首次安装不误报**：新增 `hasWaitingUpdate(reg)`——只有「已有 active SW + waiting 是另一个 worker」才算可接管的更新。验证中发现首次安装的 `installed → activating` 之间 `registration.waiting` 会瞬时非空，原实现会亮圆点、并把手动检查误报成「发现新版本」。
- **首帧竞态**：按钮在所有监听器挂好之后才 `hidden = false`，避免第一下点击落空（验证时实际踩到）。
- **`watch()`**：`updatefound` 后监听 `statechange`；到达 `installed` 时用 `waitForWaiting()` 再等最多 2 秒，兼容 WebKit「statechange 先于 registration.waiting 落地」。
- **`main.ts`**：加顶栏按钮（`↻` + 圆点）与更新模态面板（复用 `.usage` 浮层样式）；PROD 下调用 `initUpdates(app)`；保留 `data-app-version`。
- **`styles.css`**：新增 `.update-*`、`.btn-primary`、`.btn[disabled]`；并调整顶栏布局以容纳新按钮——`gap` 10→8、品牌与顶栏按钮不折行、计数 13→12px 且可收缩省略、更新按钮 30px。

## 验证记录（2026-11-22）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 42 个测试全绿（无新增/改动测试） |
| `npm run smoke` | SW 不变量 OK + 离线承诺 OK |
| CDP 端到端（全新 profile，390×844，真实 build/preview） | 初始：按钮可见、圆点隐藏、面板「已是最新」、当前版本 `v0.1.0+845804e`、按钮「检查更新」 |
| 模拟部署（改 `dist/sw.js` 与 meta 为 `v0.1.0+testui`） | 再次打开面板 → 「发现新版本」、圆点出现、aria-label「有新版本，检查更新」、按钮「立即更新」 |
| 点「立即更新」 | `controllerchange` → reload → `data-app-version` 变为 `v0.1.0+testui`；旧缓存 `845804e` 删除，新缓存 `testui` 保留；新页面圆点隐藏 |
| 离线手动检查 | 断网后打开面板 → 「当前离线，无法检查」 |
| 顶栏 390px | `clientWidth = scrollWidth = 358`，顶栏高 62；品牌/按钮不折行，计数可省略 |
| 截图（临时，不进仓库） | 顶栏、已是最新面板、发现新版本面板 均人工检查过 |

**未自动覆盖**：10 分钟节流后的 `visibilitychange` 自动检查（需等满 10 分钟；代码为共享的 `checkForWaiting`，启动路径已跑过）、5 秒兜底重载、15s/30s/2s 超时分支（成功路径已覆盖）。这些留给真机验收/后续需要时再验。

## 备注（本票不做）

- 「发现新版本」不显示新版本号；要显示需给 waiting SW 增加版本回报协议。
- 不做二次确认、「稍后/忽略」、清除缓存或重置。
- 真机验收步骤：部署 v1 → 改 App 代码提交并部署 v2 → 主屏 App 回到前台看圆点 → 立即更新 → 面板版本变化；同时确认 iOS 16.1.1 上没有因 `controllerchange` 不派发而卡住（5 秒兜底会重载）。
