/**
 * search-text seam：搜索文本的当前行编辑与自动补全候选（纯函数，text → text）。
 *
 * 与 query seam 共享 token grammar（`splitToken`）。这里只管文本改写，
 * 不碰 DOM、focus、render——那些留给 `main.ts` 的薄胶水。
 */
import { splitToken } from './query';

/** 工具栏字段算子按钮；数组顺序即展示顺序。 */
export const FIELD_OPS = [
  { op: 'k:', label: '关键词' },
  { op: 'k^:', label: '关键词^' },
  { op: 'k$:', label: '关键词$' },
  { op: 'k^$:', label: '关键词^$' },
  { op: 'h:', label: '首词' },
  { op: 'h^:', label: '首词^' },
  { op: 'h$:', label: '首词$' },
  { op: 'h^$:', label: '首词^$' },
] as const;

export type FieldOp = (typeof FIELD_OPS)[number]['op'];

export type SearchEdit =
  | { kind: 'fieldOp'; op: FieldOp }
  | { kind: 'toggleExclude' }
  | { kind: 'complete'; word: string };

/** 当前（最后）行的 token，已去首尾空白并按空白切分。 */
function currentTokens(text: string): string[] {
  const lines = text.split('\n');
  return lines[lines.length - 1].trim().split(/\s+/).filter(Boolean);
}

/** 用重排后的 token 覆盖最后一行，其他行保持原样。 */
function replaceCurrentLine(text: string, tokens: string[]): string {
  const lines = text.split('\n');
  lines[lines.length - 1] = tokens.join(' ');
  return lines.join('\n');
}

/**
 * 对搜索文本应用一次编辑，返回新文本；不适用时原样返回。
 * - 只动最后一行；改写时该行 token 用单个空格重排。
 * - `fieldOp`：有末词则加/替换字段前缀（保留 `!` 与原值）；无 token 则追加前缀。
 * - `toggleExclude`：末词取反 / 取消取反；无 token 不变。
 * - `complete`：只替换末词的值，保留 `!` 与原字段前缀原文；无 token 不变。
 */
export function editSearchText(text: string, edit: SearchEdit): string {
  const tokens = currentTokens(text);

  switch (edit.kind) {
    case 'fieldOp': {
      if (tokens.length === 0) {
        return text === '' || text.endsWith('\n') ? text + edit.op : text + ' ' + edit.op;
      }
      const i = tokens.length - 1;
      const { negate, value } = splitToken(tokens[i]);
      tokens[i] = (negate ? '!' : '') + edit.op + value;
      return replaceCurrentLine(text, tokens);
    }

    case 'toggleExclude': {
      if (tokens.length === 0) return text;
      const i = tokens.length - 1;
      tokens[i] = tokens[i].startsWith('!') ? tokens[i].slice(1) : '!' + tokens[i];
      return replaceCurrentLine(text, tokens);
    }

    case 'complete': {
      if (tokens.length === 0) return text;
      const i = tokens.length - 1;
      const { negate, prefix } = splitToken(tokens[i]);
      tokens[i] = (negate ? '!' : '') + prefix + edit.word;
      return replaceCurrentLine(text, tokens);
    }
  }
}

/** 自动补全的两份词表；由前缀的字段算子决定用哪一份。 */
export interface CompletionVocabulary {
  /** 关键词行词库：裸词与 `k:` 系列使用。 */
  keyword: readonly string[];
  /** 首词词库：`h:` 系列使用（首词匹配范围，避免给出必然零结果的候选）。 */
  head: readonly string[];
}

/**
 * 当前行末词的补全候选：大小写不敏感前缀匹配、排除完全相等、上限 8、保持词库顺序。
 *
 * 匹配对象是末词去掉 `!` 与字段算子前缀后的值；`!` 与前缀不再屏蔽候选，
 * 值为空（如 `k:`、`h:`、`!`）视为空前缀，取对应词表前 8。
 * 无 token（空文本 / 仅空白）无候选。`h` 系列用首词词库，其余用关键词行词库。
 */
export function completions(text: string, vocabulary: CompletionVocabulary): string[] {
  const tokens = currentTokens(text);
  if (tokens.length === 0) return [];

  const { prefix, value } = splitToken(tokens[tokens.length - 1]);
  const words = prefix[0]?.toLowerCase() === 'h' ? vocabulary.head : vocabulary.keyword;

  const key = value.toLowerCase();
  return words
    .filter((word) => {
      const lower = word.toLowerCase();
      return lower.startsWith(key) && lower !== key;
    })
    .slice(0, 8);
}
