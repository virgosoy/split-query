# 19: 文件倒序（排序下拉新增「文件倒序」）

**What to build:** 结果区排序下拉从「文件顺序 / 随机」扩为「文件顺序 / 文件倒序 / 随机」。选「文件倒序」时以条目整体顺序的反转作为渲染基底（文件最后一条排最前），搜索结果为该基底过滤后的子序列；条目内部的首词行、URL 行、描述、换前缀 chips 顺序不变。它是会话内的视图状态：刷新/重开回到「文件顺序」，不写 `localStorage`；重新导入保持当前选择。`order` seam 新增 `reverse<T>` 纯函数与测试。

**Blocked by:** 无

**Status:** resolved——`npm run check`、`node scripts/verify-quick-input.mjs` 与本地 CDP 文件倒序场景均通过；iPhone 14 / iOS 16.1.1 真机验收待做

- [x] `order.ts`：`reverse<T>(items: readonly T[]): T[]`（返回新数组、不修改入参）
- [x] `order.test.ts`：空 / 单元素、精确期望、不修改入参且返回新数组
- [x] `main.ts`：`SortMode` 加 `file-reverse`；下拉第三项；`renderFiltered` 按模式取基底；「换一批」仍只在随机出现
- [x] 重新导入保持选择；刷新回「文件顺序」
- [x] 文档：spec v1.1 追加、正文排序口径、GLOSSARY、draft.md
- [x] `npm run check`
- [x] 本地人工验证（排序切换与搜索子序列）
- [ ] iPhone 14 / iOS 16.1.1 真机验收

## 实现说明

- **`src/lib/order.ts`**：新增 `reverse<T>(items)` = `items.slice().reverse()`；只反转条目整体顺序，不处理条目内部。
- **`src/main.ts`**：`SortMode` 扩为 `'file' | 'file-reverse' | 'random'`；下拉第三项「文件倒序」；`renderFiltered()` 按模式取基底（`randomOrder` / `reverse(items)` / `items`）后过滤，因此搜索结果是倒序列表的子序列；下拉 `change` 三分支映射；「换一批」的显示条件仍是 `sortMode !== 'random'`，未改。`syncSortbar()` 同时把 `sortSelect.value` 同步为当前 `sortMode`，防止浏览器刷新恢复表单状态时控件与视图状态脱节（code-review 后补）。
- **生命周期**：`sortMode` 初始值仍是 `'file'`，刷新即回文件顺序；`applyItems()` 的「随机才重滚」逻辑不变，选倒序时新数据自然按倒序展示。
- **未触碰**：`query.ts`、`storage.ts`、`sw.js`、构建脚本与缓存管线。

## 验证记录（2026-11-25）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 126 个测试全绿（`order.test.ts` 10 个，新增 `reverse` 4 个） |
| `node scripts/verify-quick-input.mjs` | ALL PASS（回归，快捷输入未受影响） |
| 本地 CDP（Vite dev，390×844，`scripts/fixtures/ui-quick-input.txt`） | 下拉三项；默认文件顺序；切倒序后条目反转；倒序下搜索「百」得到倒序子序列；清空搜索回到全部倒序；切随机仍滚 3 条且「换一批」出现；切回倒序「换一批」隐藏；重新导入保持倒序选择；刷新回到文件顺序 |
| iPhone 14 / iOS 16.1.1 真机 | 待做：重点看下拉三项的选择手感，以及倒序下结果滚动位置 |

复审后补 `syncSortbar()` 的控件值同步；`npm run check`（126 tests）与上述本地 CDP 脚本复跑均通过。
