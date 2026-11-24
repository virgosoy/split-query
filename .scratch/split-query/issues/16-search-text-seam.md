# 16: 搜索文本编辑 seam（search-text）

**What to build:** 把 `src/main.ts` 里的当前行读取/改写、operator inventory 与补全过滤收进新的纯 seam `src/lib/search-text.ts`；`query.ts` 导出 `splitToken` 作为共享 grammar；`main.ts` 只保留 DOM wiring。这是架构评审 Candidate 1，**行为不变**（字段前缀后的补全仍不做）。

**Blocked by:** 无

**Status:** open——refactor only；待实现

- [ ] `query.ts` 导出 `splitToken`，`parseTerm` 改用它
- [ ] 新增 `src/lib/search-text.ts`：`FIELD_OPS`、`editSearchText`、`completions`
- [ ] 新增 `src/lib/search-text.test.ts`，并补 `query.test.ts` 的 `splitToken` 用例
- [ ] `main.ts` 改用 module，删除本地 grammar/当前行工具/`FIELD_OPS`
- [ ] 文档：`CLAUDE.md` seam 四改五、`CODING_STANDARDS.md` pure seam 列表、`spec.md` v1.1 追加
- [ ] `npm run check` 通过
- [ ] `node scripts/verify-quick-input.mjs` 通过（行为不变）

## 设计决定

### 新 module：`src/lib/search-text.ts`

```ts
export const FIELD_OPS = [
  { op: 'k:',    label: '关键词' },
  { op: 'k^:',   label: '关键词^' },
  { op: 'k$:',   label: '关键词$' },
  { op: 'k^$:',  label: '关键词^$' },
  { op: 'h:',    label: '首词' },
  { op: 'h^:',   label: '首词^' },
  { op: 'h$:',   label: '首词$' },
  { op: 'h^$:',  label: '首词^$' },
] as const;

export type FieldOp = (typeof FIELD_OPS)[number]['op'];

export type SearchEdit =
  | { kind: 'fieldOp'; op: FieldOp }
  | { kind: 'toggleExclude' }
  | { kind: 'complete'; word: string };

export function editSearchText(text: string, edit: SearchEdit): string;
export function completions(text: string, words: readonly string[]): string[];
```

- 纯函数，text → text；不碰 DOM、focus、render。
- `main.ts` 设置 value 后光标落在末尾（保持现状）。
- `FIELD_OPS` 与 label 从 `main.ts` 移入；按钮由它渲染。
- `completions` 接收纯词数组；`main.ts` 传 `vocab.map((e) => e.word)`。

### `query.ts` 的共享 grammar

```ts
export interface SplitToken {
  negate: boolean;
  prefix: string; // 匹配到的字段算子前缀，如 'k^:'；没有则 ''
  value: string;  // 原始大小写；可以为空
}

export function splitToken(token: string): SplitToken;
```

- 去掉前导 `!` 后匹配 `^(k|h)(\^)?(\$)?[:：]/i`；`prefix` 保留原文（含大小写/全角冒号），`value` 保留原文大小写，允许为空。
- `parseTerm` 改为使用 `splitToken`，再从 `prefix` 解释 field/mode；`value === ''` 时仍返回 `null`（跳过该 token）。
- 工具栏改写用 `prefix` 判断/替换，用 `value` 保留原输入。
- 共享 grammar 以 query 的合法语法为准：`k$^:` 这类非法锚点顺序不再被工具栏当作字段前缀（当前 `FIELD_OP_RE` 会）。这是唯一已知的行为收紧，用测试固定。

## 行为契约（保持不变）

- 只处理最后一行；该行 token 去首尾空白、用单个空格重排；其他行不动。
- `fieldOp`：
  - 有末词：保留 `!`；有字段前缀则替换，否则前置。`h:vue` → `k^:vue`。
  - 无 token：空文本或行尾换行直接接 `op`，否则接 `" " + op`。
- `toggleExclude`：末词 `!` 取反/取消；无 token 不变。
- `complete`：只替换**可补全的裸末词**；空末词、`!` 开头、已有字段前缀时不变。
- `completions`：大小写不敏感前缀匹配、排除完全相等、上限 8、保持 vocab 顺序；空/`!`/字段前缀返回 `[]`。
- `main.ts` 的 focus/render 时机保持现状（`fieldOp` 总是 focus/render；`toggleExclude` / `complete` 按现有行为）。
- **不做**字段前缀后的补全；这是 `draft.md` 的后续票。

## 测试矩阵

`query.test.ts` 新增 `splitToken`：
- 裸词、`!`、`k:`、`k^:`、`h$:`、`k^$:`、全角冒号、大小写保留、空 value、非法 `k$^:`。

`search-text.test.ts`：
- `fieldOp`：空文本、裸词、已有 `k:`、已有 `h:`、`!`、多行只改末行、空白重排、空末行追加。
- `toggleExclude`：开/关、`k:vue`、多行。
- `complete`：裸词替换；`!` / 字段前缀 / 空末词不改。
- `completions`：前缀、大小写、完全相等排除、上限 8、非法上下文返回空。
- 兼容性：`FIELD_OPS` 每个 op 都被 `splitToken(op + 'x')` 识别，prefix 完全相等。

## 文档

- `CLAUDE.md`：纯 seam 四改五，加入 `src/lib/search-text.ts`。
- `CODING_STANDARDS.md`：pure seam 列表加入 `search-text`。
- `spec.md`：增加「v1.1 追加（2026-11-24）：搜索文本编辑 seam」——行为不变、grammar 单一来源、测试边界。
- 不需要 ADR；不新增 GLOSSARY 术语。

## 实现顺序与验证

1. `query.ts` 抽出/导出 `splitToken`，重构 `parseTerm`，补测试。
2. 新增 `search-text.ts` 与测试。
3. `main.ts` 改用 module：删除 `FIELD_OP_RE` / `hasFieldOp` / `stripNeg` / `editCurrentLine` / `toggleExclude` / `applyFieldOp` / 本地 `FIELD_OPS`；按钮与 chip 只映射成 action。
4. 跑 `npm run check` 与 `node scripts/verify-quick-input.mjs`；不跑 smoke（不碰 SW / 构建产物）。

## 不做

- 不改搜索语法、算子集合或 UI 标签。
- 不实现字段前缀后的补全。
- 不动最近搜索、资源空间、更新、导入。
- 不新增 ADR。

## 参考

- 架构评审 Candidate 1（temp HTML，未入仓库）
- 票 15：关键词锚点快捷按钮
- `draft.md`：自动补全支持字段前缀（后续项）
