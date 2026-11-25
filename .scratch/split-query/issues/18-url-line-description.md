# 18: URL 行描述

**What to build:** 以 `http(s)://` 开头的其他行按第一个空白串切分：之前是 URL，之后是描述。链接文字与 `href` 只含 URL；描述以静音小字显示在链接后，仍参与全文搜索。地址条目的 URL 行同样切分，基址只取 URL 部分。parse seam 新增纯函数 `splitUrlLine` 与测试。

**Blocked by:** 无

**Status:** resolved——`npm run check`、`node scripts/verify-quick-input.mjs` 与本地 CDP 地址/描述场景均通过；iPhone 14 / iOS 16.1.1 真机验收待做

- [x] `parse.ts`：`UrlLine` + `splitUrlLine`；`parseFile` / `otherLines` 形状不变
- [x] `parse.test.ts`：新增 6 个用例，并固定「URL 行带描述时 otherLines 保留整行」
- [x] `address.ts`：`splitUrl` 先经 `splitUrlLine`，带描述的地址行/链接行都能正确取基址
- [x] `address.test.ts`：地址行与链接行带描述时只取 URL
- [x] `main.ts`：`.link-row` + `.item-link` + 可选 `.link-note`；chips 接在行后；可用性扫描同步
- [x] `styles.css`：链接行 flex 换行、描述静音可折行
- [x] `scripts/fixtures/ui-address.txt`：所有 URL 行加描述
- [x] 文档：spec v1.1 追加、GLOSSARY「链接描述」、draft.md
- [x] `npm run check` 通过（122 tests）
- [x] `node scripts/verify-quick-input.mjs` 通过
- [ ] 人工验收：本地 CDP 已通过（见下）；iPhone 14 / iOS 16.1.1 真机待做

## 设计决定

### `splitUrlLine`（parse seam）

```ts
export interface UrlLine {
  url: string; // 第一个空白前，保留原大小写
  note: string; // 描述；没有时为 ''（去首尾空白，内部空白保留）
}
export function splitUrlLine(line: string): UrlLine | null; // 非 http(s) → null
```

- 入口门槛仍是 `isHttpUrl`；不做额外 URL 校验。
- 空白口径为 JS `\s`（半角空格、Tab、全角空格、NBSP）。
- `parseFile` 不拆行：`otherLines` 仍保留「URL + 描述」整行，IndexedDB 无迁移。
- 描述仍是条目文本的一部分，全文搜索行为不变。

### 渲染

- 每个 URL 行统一渲染为：

```html
<div class="link-row">
  <a class="item-link" href="URL" target="_blank" rel="noopener noreferrer">URL</a>
  <span class="link-note">描述</span>
</div>
```

- 无描述时不渲染 `.link-note`；「换前缀」chips 行接在 `.link-row` 之后。
- `.link-row` 用 flex + `flex-wrap`，描述在窄屏自然换到下一行。
- 地址条目自己的 URL 行同样显示描述；基址匹配只取 URL 部分。

### 测试矩阵

`parse.test.ts`：

- 无描述 → `note` 为 `''`；第一个空白串之后全算描述且内部空白保留；Tab 与全角空格；`HTTP` 大写保留；行尾空白 / 空描述；非 http(s) → `null`。
- `parseFile` 的 URL 行带描述时 `otherLines` 保留整行。

`address.test.ts`：

- 地址行带描述时只取 URL 作基址；链接行带描述时描述不进入替换结果。

## 实现说明

- **`src/lib/parse.ts`**：新增 `UrlLine` 与 `splitUrlLine`；正则 `/^(\S+)(?:\s+(.*))?$/` 取第一个空白前的 URL，其余 `trim()` 为描述。
- **`src/lib/address.ts`**：`splitUrl` 改为先调用 `splitUrlLine` 再解析 authority；因此 `baseOf` 与 `alternativesFor` 都能直接吃带描述的原始行。
- **`src/main.ts`**：渲染分支改用 `splitUrlLine`；`href` / 链接文字只取 `url`，描述写入 `.link-note`；可用性扫描同样按 URL 部分判断。
- **`src/styles.css`**：`.item-link` 去掉 `display: block` 与自身上下 padding，改由 `.link-row` 承担；新增 `.link-note`。
- **未触碰**：`query.ts`（描述仍参与全文搜索）、IndexedDB schema、`sw.js` / 构建脚本 / 缓存管线。

## 验证记录（2026-11-25）

| 检查 | 结果 |
| --- | --- |
| `npm run check` | tsc 无错 + 122 个测试全绿（parse 新增 6、address 新增 1） |
| `node scripts/verify-quick-input.mjs` | ALL PASS（工具栏、改写、锚点语义、390px 布局不变） |
| 本地 CDP（全新 profile，390×844，Vite dev，导入 `scripts/fixtures/ui-address.txt`） | 25 项全过：所有 href 不含描述或 `%20`；链接文字只含 URL；地址行与非地址行的描述都显示；换基址在带描述的地址行上仍命中；路径/查询/大小写规则不变；描述参与全文搜索；展开与折叠、开关持久化、重新导入/刷新、无地址条目时开关隐藏均不变；390px 无横向溢出 |
| iPhone 14 / iOS 16.1.1 真机 | 待做：重点看描述与链接的折行、长 URL 的点击区域、收起/展开后的滚动位置 |

## 不做

- 不支持未编码的空格 URL（URL 内含空格必须写成 `%20`）。
- 不改关键词行的分词规则；描述不成为独立字段，不参与排序或换基址。
- 不把描述导出/回写文件（文件是真源，应用只读）。

## 参考

- `spec.md`「v1.1 追加（2026-11-25）：URL 行描述」
- `GLOSSARY.md`：链接描述
- 票 17：地址前缀替换（换基址）
- `draft.md` 第 23 行
