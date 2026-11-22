# 14: 按需随机排序（排序下拉 + 换一批）

**What to build:** 结果区上方加入排序行：原生下拉「文件顺序 / 随机」+「换一批」（仅随机时出现）。随机是会话内的视图状态：进入随机时对全部条目滚一个排列，搜索结果取该排列的子序列，输入搜索时不重滚。新增 `src/lib/order.ts` 纯 seam 与测试。

**Blocked by:** 无

**Status:** resolved——本地 CDP 与 `npm run smoke` 均通过；iPhone 14 / iOS 16.1.1 真机验收待做

- [x] `src/lib/order.ts`：`shuffle<T>(items, random)`（Fisher–Yates，不修改入参，随机源注入）；`src/lib/order.test.ts`：不丢不重、空/单元素、给定伪随机序列得到确定排列、入参不变
- [x] 排序行 UI：结果区上方，「排序」标签 + 原生 `<select>`（`文件顺序` / `随机`）+「换一批」；字号 16px；无条目时整行隐藏
- [x] 默认文件顺序；切入随机滚新排列；「换一批」重滚；停留随机时输入搜索不重滚（全排列子序列）
- [x] 会话内有效：刷新/重开回文件顺序，不写 `localStorage`
- [x] 重新导入保持当前排序选择；随机则为新数据滚新排列
- [x] 文档：spec v1.1 追加、CLAUDE.md seam 数三改四、CODING_STANDARDS、GLOSSARY 三个词、draft.md
- [x] `npm run check` 通过（tsc + 48 tests）
- [ ] 人工验收：本地 CDP 已通过（见下）；iPhone 14 / iOS 16.1.1 真机待做

## 实现说明

- **`src/lib/order.ts`**：`shuffle<T>(items, random = Math.random)` 用 Fisher–Yates 从末尾向前交换，返回新数组、不修改入参；随机源注入使测试确定、不 flaky。
- **`src/main.ts`**：新增 `sortMode: 'file' | 'random'` 与 `randomOrder: Item[]`。`renderFiltered()` 在随机模式下以 `randomOrder` 为基底过滤，因此搜索结果天然是全排列的子序列；`syncSortbar()` 控制整行（无条目隐藏）与「换一批」（仅随机显示）；`rollRandomOrder()` 在切入随机、点「换一批」、重新导入（仅随机模式）时重滚。下拉 `change` 切模式；按钮 `click` 只重滚。刷新后 `sortMode` 回到初始值 `file`。
- **`src/styles.css`**：`.sortbar` 一行（label + select + 右对齐的「换一批」），显式写 `.sortbar[hidden] { display: none; }`（否则 flex 覆盖 `hidden`）；`.sort-select` 与 `.sort-reroll` 字号 16px，避免 iOS 聚焦表单控件自动放大。
- **未触碰**：`src/lib/query.ts`（谓词仍不改变顺序）、`sw.js` / 构建脚本 / 缓存管线。
- **文档**：spec 增加「v1.1 追加（2026-11-22）：按需随机排序」并改写原「始终文件顺序」条款；CLAUDE.md / CODING_STANDARDS 的 seam 数由三改四；GLOSSARY 增加「排序方式」「随机排列」「换一批」；draft.md 记录。

## 验证记录（2026-11-22）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 48 个测试全绿（新增 `order.test.ts` 6 个） |
| `npm run build` | 构建成功；`dist/sw.js` = `v0.1.0+fa30cb2`，预缓存 8 项 |
| 本地 CDP（全新 profile，390×844，真实 build/preview，导入 `draft/demo.txt`） | 默认文件顺序；切「随机」后为全排列、「换一批」出现；搜索「百度」得到随机全排列的子序列；清空搜索顺序不变；伪随机 0 下「换一批」输出预期左移；切回文件顺序并隐藏按钮；重新导入保持随机选择且重滚；刷新后从 IndexedDB 恢复并回到文件顺序 |
| `npm run smoke` | 全链路通过：SW 不变量 + 离线承诺。此前浏览器启动阶段的误判已修（`scripts/browser.mjs` 不再以启动器退出判死，`close()` 先发 `Browser.close`；见 draft.md） |
| iPhone 14 / iOS 16.1.1 真机 | 待做：重点看下拉与「换一批」聚焦/点击不触发放大，以及随机顺序与「换一批」的实际手感 |
