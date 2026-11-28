# 21: 结果区按页渲染（1 万条输入卡顿）

**What to build:** 导入约 1 万条目后，搜索框逐字输入不再卡顿。结果区每次只渲染前 200 条命中（一页），其余由底部的「加载更多」按页追加；计数行显示「共 N 条，已显示 M 条」，全部显示后改为「已全部显示」并隐藏按钮。追加只插入新卡片，不重建已有卡片。命中集合、顺序、查询语义与数据均不变。

**Blocked by:** 无（可立即开始）

**Status:** resolved——`npm run check`（147 tests）、`node scripts/perf-search-10k.mjs`（1 万 / 2 万条均 ALL PASS）与 `node scripts/verify-quick-input.mjs` 均通过；iPhone 14 / iOS 16.1.1 真机滚动验收待做

- [x] 定位：建立浏览器性能反馈环 `scripts/perf-search-10k.mjs`，在 1 万条 fixture 上复现（约 600ms/击键）
- [x] 分段测量，排除查询与补全：filter 4–6ms、suggestions <5ms、render 120–580ms、layout 420–500ms
- [x] `main.ts` 拆出 `createCard()` / `appendCards()`（`DocumentFragment` 批量插入），新增 `matches` / `shown` 与 `PAGE_SIZE = 200`
- [x] `renderFiltered()` 每次把已显示数重置为一页；查询、排序、重新导入、地址开关走同一路径
- [x] 新增 `.results-more` 计数行与「加载更多」按钮；追加不重建已有卡片，全部显示后保留计数、隐藏按钮
- [x] 性能反馈环锁定新契约：首屏只渲染一页、计数行文案、加载更多追加一页且单次点击 ≤100ms
- [x] `npm run check` 通过；`node scripts/verify-quick-input.mjs` ALL PASS（50 项，行为未回归）
- [x] 文档：`spec.md` 的「v1.2 追加」、`GLOSSARY.md` 的「结果分页」、`CLAUDE.md` 的 Perf check、`draft.md` 记录票号
- [ ] iPhone 14 / iOS 16.1.1 真机验收（重点：1 万条下逐字输入、200 条卡片的滚动流畅度、「加载更多」点击）

## 实现说明

- **`src/main.ts`**：`render(list)` 拆为 `createCard(item)`（单条卡片 DOM）与 `appendCards(list, before?)`（`DocumentFragment` 建批、一次插入）。新增模块级 `PAGE_SIZE = 200`、`matches`（当前完整命中集合）、`shown`（已渲染条数）。`renderFiltered()` 计算 `matches` 后把 `shown` 重置为 `min(PAGE_SIZE, matches.length)`，再交给 `renderResults()`。`appendMoreRow()` 生成计数行：点击时 `shown += PAGE_SIZE`（封顶命中数），只用 `matches.slice(前, 后)` 追加到计数行之前；全部显示后文案改为「已全部显示」并 `hidden` 按钮。空态提示、卡片内部结构与地址替代前缀渲染不变。
- **`src/styles.css`**：新增 `.results-more`（纵向居中、13px、`var(--muted)`）。
- **未触碰**：查询语法与匹配语义、`parse.ts`、`storage.ts`、排序与随机重滚、地址前缀池、自动补全、`sw.js` / 构建脚本 / 缓存管线。

## 验证记录（2026-11-28）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 147 个测试全绿 |
| `node scripts/perf-search-10k.mjs`（修复前） | 1 万条：输入「v」1085ms、「vu」586ms、「vue」592ms，全部 FAIL（预算 100ms）；分段 filter 4–6ms / render 120–580ms / suggestions <5ms，layout 420–500ms；关闭地址前缀替换只省约 20ms |
| 最小化 | 同一脚本 `--items 1000`：53–69ms PASS；`--items 100`：15–16ms PASS → 「约 1 万条命中」是必要要素 |
| `node scripts/perf-search-10k.mjs`（修复后） | 1 万条：输入「v」82.5ms（含冷启动）、「vu」28ms、「vue」16.8ms；加载更多 12.2ms；契约检查全 PASS。2 万条：25.9 / 22.1 / 18.3ms，加载更多 13.3ms，ALL PASS |
| `node scripts/verify-quick-input.mjs` | ALL PASS，50 项；工具栏仍两行、无横向溢出 |
| iPhone 14 / iOS 16.1.1 真机 | 待做：1 万条下逐字输入、200 条卡片滚动、「加载更多」点击 |

## 不做

- 不做虚拟列表：一页 200 条已把击键降到预算内；若真机滚动仍卡再评估。
- 不做输入防抖：每击键已在预算内，防抖只会推迟结果更新。
- 不做页码 / 页大小可调等分页控件；只有「加载更多」。
- 不改命中集合、排序、查询语法、地址前缀替换、自动补全与存储。
