# 20: 自动补全字段前缀（含首词词库与取反）

**What to build:** 搜索框在裸词、`k:` / `k^:` / `k$:` / `k^$:`、`h:` 系列、带 `!`、大写/全角前缀、值为空等状态下都显示正确候选；点选只替换值，`!` 与原前缀逐字保留（大小写、半/全角冒号、锚点原样）；`h:` 只出现首词候选。候选规则保持词频降序、同频首见、上限 8、大小写不敏感、排除完全相等；空文本仍无候选。不改查询语法与匹配语义。

**Blocked by:** 无（可立即开始）

**Status:** resolved——`npm run check`、`node scripts/verify-quick-input.mjs`（含新增补全断言）与本地 CDP 各前缀/点选场景均通过；iPhone 14 / iOS 16.1.1 真机验收待做

- [x] `completions` 改为按值匹配：`!` 与字段前缀不再屏蔽候选；值为空时给对应词表前 8
- [x] `completions` 按前缀选词表：`k` 系列与裸词用关键词行词库，`h` 系列用首词词库
- [x] `editSearchText({kind:'complete'})` 只替换值，保留 `!` 与原前缀原文
- [x] `buildHeadVocabulary(items)` 从首词聚合，排序/去重/同频规则与 `buildVocabulary` 一致；`buildVocabulary` 签名与行为不变
- [x] `main.ts` 构建两份词表并传入；候选 chip 的渲染、点击、focus、隐藏时机不变
- [x] `search-text` 与 `query` seam 的测试：现有守卫用例翻转为新契约，覆盖裸词 / `k:` / `k^:` / `h:` / `!` / `!k:` / 全角冒号 / 大写前缀 / 空值 / 多 token / 多行
- [x] 扩展现有 UI 验证脚本：断言 chip 的出现/隐藏与点选后的文本；`h:` 不出现非首词候选
- [x] `npm run check` 通过
- [x] 本地 CDP 人工验证覆盖各前缀状态与点选结果
- [x] 文档：`draft.md` 记录票号；确认 `GLOSSARY.md` 无需新增术语
- [ ] iPhone 14 / iOS 16.1.1 真机验收（按既有票惯例：完成后记待做）

## 实现说明

- **`src/lib/query.ts`**：抽出私有 `countVocabulary(words)`（词频降序、同频首见、去重）；`buildVocabulary(items)` 改为 `countVocabulary(items.flatMap(keywordLine.split(/\s+/)))`，签名与行为不变；新增 `buildHeadVocabulary(items)` = `countVocabulary(items.map(i => i.headKeyword))`。
- **`src/lib/search-text.ts`**：新增 `CompletionVocabulary { keyword, head }`；`completions(text, vocabulary)` 用 `splitToken` 的 `value` 做前缀匹配（`negate` 不参与判断），前缀首字母为 `h`（大小写不敏感）用 `head`，否则用 `keyword`；空值视为空前缀，取对应词表前 8（排除完全相等）。`editSearchText({kind:'complete'})` 重建为 `(negate ? '!' : '') + prefix + word`，前缀逐字保留，不做规范化。
- **`src/main.ts`**：新增 `headVocab`，`applyItems()` 同时构建两份词库；`updateSuggestions()` 传入 `{ keyword, head }`；chip 渲染、点击、focus、隐藏时机未改。
- **未触碰**：查询语法与匹配语义、`parse.ts`、`storage.ts`、排序、`sw.js` / 构建脚本 / 缓存管线。

## 验证记录（2026-11-27）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 147 个测试全绿（`search-text.test.ts` 59 个，`query.test.ts` 49 个） |
| `node scripts/verify-quick-input.mjs` | ALL PASS，50 项；新增 21 项补全断言：空文本无候选、裸词/`k:`/`k^:`/`!`/`!k:`/大写+全角/`h:`/多行/多 token 的 chip 出现与内容、`h:` 不出现非首词候选、点选后 `!` 与原前缀逐字保留 |
| 本地 CDP（Vite dev，390×844，`scripts/fixtures/ui-quick-input.txt`） | 各前缀状态与点选结果通过（见上）；390px 工具栏仍两行、无横向溢出 |
| iPhone 14 / iOS 16.1.1 真机 | 待做：重点看软键盘下候选行是否遮挡结果、点选后光标与键盘是否保持 |

复审后补：`editSearchText` 的 `complete` 文档改为新契约；私有 helper 更名 `aggregateVocabulary`；验证脚本三处「设值 + 派发 input」抽成 `withSearch`；补 `h^:` 用例。复跑 `npm run check`（147 tests）与 `node scripts/verify-quick-input.mjs`（ALL PASS）均通过。

## 不做

- 光标感知补全：仍固定作用于末行末词（`draft.md` 已记后续项）。
- 不按命中结果动态过滤候选、不做模糊匹配 / 拼音 / 权重学习。
- 不改变候选词库来源（仍只有关键词行/首词，不纳入 URL 行、链接描述或其他行）。
- 不改搜索语法、算子集合、工具栏按钮、最近搜索、排序与存储。
