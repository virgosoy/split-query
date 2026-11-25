# 17: 地址前缀替换

**What to build:** 首词严格为「地址」的条目提供基址池；其他条目中前缀命中的链接，在链接下方显示替代前缀 chip（最多 2 个 + 「还有 N 个」展开），点 chip 用替代基址 + 原路径/查询/哈希打开。结果区上方（排序行下方）加「地址前缀替换」开关（默认开，`localStorage` 持久化）。新增纯 seam `src/lib/address.ts` 与测试。

**Blocked by:** 无

**Status:** resolved——`npm run check`、`node scripts/verify-quick-input.mjs` 与本地 CDP 地址场景均通过；iPhone 14 / iOS 16.1.1 真机验收待做

- [x] `src/lib/address.ts`：`isAddressItem`、`buildAddressPool`、`alternativesFor`；基址切分、大小写/端口/尾斜杠规则、条目内作用域与跨条目同基址并集
- [x] `src/lib/address.test.ts`：14 个用例（见测试矩阵）
- [x] `main.ts`：导入时构建池与可用性；命中链接下方渲染替代行；地址条目自身不渲染
- [x] 开关行：排序行下方，「地址前缀替换」+ `role="switch"`；无可用替代时整行隐藏；关闭后保留
- [x] 偏好：`localStorage` key `split-query:address-alternatives`，缺省为开，关闭写 `off`
- [x] 展开：最多 2 个 chip，其余「还有 N 个」原地展开、按钮消失、不可收起；重渲染回到折叠态
- [x] 面板口径：`spec.md` 两个存储桶段落 + `main.ts` 的 `.usage-note` 注明偏好不计入
- [x] 文档：spec v1.1 追加、GLOSSARY 两词、`CLAUDE.md` / `CODING_STANDARDS.md` seam 五改六、draft.md
- [x] `scripts/fixtures/ui-address.txt`
- [x] `npm run check` 通过（115 tests）
- [x] `node scripts/verify-quick-input.mjs` 通过（行为不变）
- [ ] 人工验收：本地 CDP 已通过（见下）；iPhone 14 / iOS 16.1.1 真机待做

## 设计决定

### seam `src/lib/address.ts`

```ts
export type AddressPool = ReadonlyMap<string, readonly string[]>;
export interface AlternativeLink {
  prefix: string; // chip 文本：替代基址去掉尾斜杠
  href: string; // 替代基址 + 原链接的路径/查询/哈希
}
export function isAddressItem(item: Item): boolean; // headKeyword === '地址'
export function buildAddressPool(items: readonly Item[]): AddressPool;
export function alternativesFor(url: string, pool: AddressPool): AlternativeLink[];
```

- 基址 = `scheme://host[:port]/`；比较键小写 scheme 与 authority，端口原样；余下部分 = 基址后第一个 `/` 之后的内容（无 `/` 时为 `?query` / `#hash` / 空）。
- 地址行只贡献基址，路径/查询/哈希忽略；同一条目内按比较键去重，保留首次出现的大小写。
- 池的值 = 同条目内其他基址；多个地址条目共享同一基址时按文件顺序并集、按比较键去重；不产生替代的基址不进入池。
- `alternativesFor` 不命中、非 http(s)、没有 authority 时返回空数组。
- 「地址条目自己的链接不显示替代」是 `main.ts` 的渲染规则；seam 只提供 `isAddressItem` 供其判断。

### UI

- 开关行在 `#sortbar` 与 `#results` 之间。可用性在 `applyItems` 里计算：全部条目中至少有一条非地址条目的链接能获得 ≥1 个替代；满足才显示该行。
- chip 用 `<a target="_blank" rel="noopener noreferrer">`，文本为替代前缀（去尾斜杠），`title` / `aria-label` 给出完整替换后 URL。
- 展开由点击事件原地插入剩余 chip、移除按钮、聚焦首个新 chip；不做收起，不记忆状态，任何重渲染自然回到折叠态。
- `localStorage` 同步读取（启动无闪烁）；读/写用 try/catch，隐私模式失败时按默认开、只影响下次启动。
- 关闭开关触发全量重渲染；开关行仍保留以便再打开。

### 测试矩阵

`address.test.ts`：

- `isAddressItem`：`地址` / `地址 内网` 为真；`地址栏` / `常用搜索` 为假。
- `buildAddressPool`：同条目内互为替代（文件顺序）、忽略非 URL 行、地址行带路径/查询只取基址并按基址去重、大小写与尾斜杠去重且保留首次拼写、多个地址条目共享基址取并集、单基址条目与非地址条目不进池、没有地址条目时池为空。
- `alternativesFor`：路径/查询/哈希原样保留；无尾斜杠、仅查询、仅哈希的链接；scheme/host 大小写不敏感且显示保留地址行原样；端口严格一致且不做默认端口归一；非 http(s) 与不在池中的链接返回空；替代项按文件顺序。

## 实现说明

- **`src/lib/address.ts`**：`splitUrl` 把 URL 拆成原样前缀（含尾斜杠）、规范化键与小写化后的余下部分；`baseOf` 用于地址行；`basesOf` 按规范化键去重；`buildAddressPool` 用 `Map<键, Base[]>` 累积后过滤空列表；`alternativesFor` 拼接 `prefix + suffix`。
- **`src/main.ts`**：新增 `addressPool` / `addressAvailable` / `addressAlternativesOn` 与 `loadAddressPref` / `saveAddressPref`；`applyItems` 重建池并计算可用性；`render` 在非地址条目的命中链接后追加 `.alt-row`；`renderAlternatives` / `createAltChip` 负责 chip 与展开；`syncAddressBar` 控制开关行显隐与 `aria-checked`；开关点击切换并写入偏好后重渲染。
- **`src/styles.css`**：`.addressbar` 紧凑一行（显式 `[hidden]`）；`.switch` 视觉轨道 44×26、触控 52×44；`.alt-row` 允许折行，`.alt-chip` 不溢出。
- **`src/main.ts` 的面板注释**：改为「只统计『条目数据』『应用资源』两个桶，不含地址前缀替换开关的偏好（localStorage）…」。
- **新增样本**：`scripts/fixtures/ui-address.txt`（两个地址条目、四基址条目、命中/不命中/端口不一致/大小写/查询路径用例）。
- **未触碰**：`src/lib/query.ts`、`src/lib/order.ts`、`src/lib/search-text.ts`、IndexedDB schema、`sw.js` / 构建脚本 / 缓存管线。

## 验证记录（2026-11-25）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 115 个测试全绿（新增 `address.test.ts` 14 个） |
| `node scripts/verify-quick-input.mjs` | ALL PASS（工具栏、改写、锚点语义、390px 两行布局均不变） |
| 本地 CDP（全新 profile，390×844，Vite dev，导入 `scripts/fixtures/ui-address.txt`） | 20 项全过：地址条目自身无替代；端口命中/不命中；路径与查询保留；大小写命中；2 个 chip + 「还有 1 个」；展开后按钮消失且焦点落到新 chip；搜索重渲染回到折叠态；关闭后 chip 消失、开关行保留并写 `off`；重新导入与刷新后偏好保留；重新打开后 chip 恢复并清除键；无地址条目的 fixture 下开关行隐藏、行为不变；无横向溢出 |
| iPhone 14 / iOS 16.1.1 真机 | 待做：重点看 chip 的点击与滚动、开关触控、关闭后刷新仍关闭 |

## 不做

- 不做替代基址的全局并集（不同地址条目的基址不互相串用）。
- 不扩大地址条目的判定（不改首词规则、不做别名）。
- 不自动探测基址可达性；替代项不排序（按文件顺序）。
- 不做「收起」或跨重渲染记忆展开状态。
- 不在资源空间面板统计 `localStorage` 偏好（`draft.md` 后续项）。

## 参考

- `spec.md`「v1.1 追加（2026-11-25）：地址前缀替换」
- `GLOSSARY.md`：地址条目、替代前缀
- 票 16：搜索文本编辑 seam（纯 seam 边界先例）
- `draft.md`：地址前缀替换条目与本轮后续项
