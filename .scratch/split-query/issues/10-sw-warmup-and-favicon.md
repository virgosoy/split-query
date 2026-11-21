# 10: Service Worker 预热容错（让「一次在线即离线」成立）

**What to build:** 修复预热（warmup）的一处缺陷，使**一次在线访问后即可离线**真正成立：预热不能再因为个别 URL 失败而整批放弃；同时消除 `/favicon.ico` 的 404。

**Blocked by:** None（可立即开始）

**Status:** resolved

- [x] 预热改为**逐条加入且容错**：单个 URL 失败不影响其余 URL（运行时发现的 URL 不由我们控制，必须容错，不能全有或全无）
- [x] 补 favicon（页面声明一个图标），消除浏览器自动请求 `/favicon.ico` 产生的 404
- [x] **关键验收**：全新浏览器 profile → 在线打开**一次** → 断网 → 重开仍能正常加载并搜索（当前首次在线后 JS/CSS 未入缓存，需要加载第二次才离线可用）
- [x] 首次在线访问后，`资源空间` 面板的 `应用资源` 即统计到完整资源（本仓库约 22 KB），而不是只统计到 shell 的 8754 B
- [x] 不改变既有缓存策略假设：静态资源缓存优先、导航网络优先、离线回退 shell
- [x] `npm run check` 通过（本票不涉及纯 seam，理应无新增测试）

## 背景与证据

票 08 的验收过程中发现（当时不在其范围内，证据见 `08-resource-usage-panel.md` 的「附带发现」）。

**根因链**：

1. 页面没有 favicon，而浏览器会自动请求 `/favicon.ico` → **404**；
2. 预热的实现用 `cache.addAll(urls)`，而它是**全有或全无**：一条请求失败即整批 reject；
3. 该 reject 又被 `.catch(() => {})` 静默吞掉 → **预热一条都没写进缓存**。

**复现证据**（2026-11-21，无头 Chrome + 真实构建/预览）：预热后缓存里只有 install 阶段的 6 条 shell 预缓存（854+854+393+1157+1286+4210 = **8754 B**）；逐条 `add` 时除 `/favicon.ico` 外全部成功，缓存变为 **22446 B**。

**后果**：不只是面板数字偏小——`sw.js` 承诺的「一次在线即离线」不成立：首次在线访问时 JS/CSS 在 SW 接管前就已加载，本应靠预热补缓存，而预热失效，故需第二次加载才进入缓存。

## 备注（本票不做）

- **同 cache 名下的旧哈希资源不会被清理**：每次部署产生新的 `assets/index-<hash>.js`，旧文件留在 `split-query-v1` 里，`应用资源` 会随部署次数只增不减。这与预热无关，是另一处 cache 卫生问题，宜另开一票（清理策略：bump 缓存名，或按当前 shell 集合裁剪）。
- 修复后建议顺手复核票 07 的真机验收：它的"离线可用"那一项此前实际上从未被真正满足。

## 实现说明

- **预热（`public/sw.js`）**：`cache.addAll(urls)` 改为 `urls.map(url => cache.add(url).catch(...))`，逐条加入、逐条容错；失败的那条 `console.warn` 掉，不再静默吞掉整批结果。`event.waitUntil` 等所有单条完成，缓存写入仍在 SW 生命周期内。URL 预过滤也包了 `try/catch`：畸形 URL 直接跳过，不会让一条坏输入中断整个预热（运行时 URL 不受我们控制）。
- **favicon（`index.html`）**：声明 `<link rel="icon" type="image/png" href="./icon-192.png" sizes="192x192">`。复用已有图标，不新增文件；`icon-192.png` 本来就在 shell 预缓存里，故不增加缓存总量。
- 缓存策略未动：静态资源仍是缓存优先，导航仍网络优先、离线回退 shell。

## 验证记录（2026-11-21）

修复前复跑 `npm run smoke`（全新 profile + 真实构建/预览）：**FAIL**，缓存只有 shell 六条、合计 8754 B，与票面证据一致。

修复后：

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 42 个测试全绿（无新增/改动测试） |
| `npm run smoke` | **OK 离线承诺成立**（一次在线 → 预缓存含 `/assets/*` → 断网刷新仍渲染） |
| 首次在线访问的资源条目 | `/assets/index-*.js`、`/assets/index-*.css`、`/manifest.json`、`/icon-192.png`；**没有 `/favicon.ico`** |
| 缓存总量（全新 profile，一次在线） | **22640 B**（shell + JS 10576 + CSS 3152） |
| `资源空间` 面板 `应用资源` | **22.1 KB**（不再是 8754 B / 8.5 KB） |
| 断网重开 | 应用正常渲染；IndexedDB 中的 2 条条目载入；搜索 `alpha` 得到 1 条结果 ✓ |

## 补记（2026-11-21 retro）

复核「修复前复跑 smoke」时发现：旧 `cache.addAll` 即使已有 favicon 声明也仍会整批失败——预热列表里 `/icon-192.png` 出现两次（favicon 声明与 manifest 图标各一次），而 `Cache.addAll` 对重复请求抛 `InvalidStateError: duplicate requests`。因此票面的根因链只写了 `/favicon.ico` 404，不完整；逐条 `cache.add` 同时解决了 404 与重复 URL 两个诱因。

`npm run smoke` 的失败信息已补上第二个诱因，并新增一条显式的「一个坏 URL 不拖垮同批好 URL」断言。去重本身记在 `draft.md` 的后续清单里。
