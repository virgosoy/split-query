/**
 * query seam：搜索文本 → (条目)=>boolean 的谓词，以及补全词库
 * （buildQuery / buildVocabulary，均纯函数，v1 的检索边界）。
 *
 * 语法（spec：.scratch/split-query/spec.md）：
 * - 同行空格分隔的条件 = AND；不同行 = OR。
 * - 每条件可为：[!][字段算子]词
 *   - 字段算子：k:（关键词行）、h:（首词）；锚点 ^（开头）$（结尾）^$（精确），缺省=包含。
 *   - 裸词（无算子）= 全文包含。
 *   - ! 取反（!react、!k:react）。
 * - 算子大小写不敏感；冒号半角 : 与全角 ：等价；`!` 须紧跟算子或词。
 * - 匹配均子串/锚定、拉丁词大小写不敏感；空/仅空白查询=全部命中；谓词不改变条目顺序。
 */
import type { Item } from './parse';

const lower = (s: string): string => s.toLowerCase();

/** 整条目文本（关键词行 + 其他行），小写化以支持拉丁词大小写不敏感匹配。 */
function itemText(item: Item): string {
  return lower([item.keywordLine, ...item.otherLines].join('\n'));
}

type Field = 'full' | 'keyword' | 'head';
type Mode = 'contains' | 'starts' | 'ends' | 'exact';

interface CompiledTerm {
  negate: boolean;
  field: Field;
  mode: Mode;
  value: string; // 已小写
}

/**
 * 一个空格分隔 token 的共享拆解结果。工具栏改写与查询解析共用这套 grammar。
 * - `prefix` 保留原文（含大小写、半/全角冒号），无字段算子时为 ''。
 * - `value` 保留原文大小写，可为空（如 `k:`）。
 */
export interface SplitToken {
  negate: boolean;
  prefix: string;
  value: string;
}

const FIELD_PREFIX_RE = /^(k|h)(\^)?(\$)?[:：]/i;

/** 拆出取反前缀、字段算子前缀与值；不校验合法性（`k$^:` 之类不视为前缀）。 */
export function splitToken(token: string): SplitToken {
  const negate = token.startsWith('!');
  const rest = negate ? token.slice(1) : token;
  const match = FIELD_PREFIX_RE.exec(rest);
  return {
    negate,
    prefix: match ? match[0] : '',
    value: match ? rest.slice(match[0].length) : rest,
  };
}

/**
 * 解析一个空格分隔的条件 token 为编译后条件。
 * 解析失败（如算子后无值）返回 null，调用方应跳过该 token。
 */
function parseTerm(token: string): CompiledTerm | null {
  const { negate, prefix, value } = splitToken(token);
  if (value === '') return null;

  let field: Field = 'full';
  let mode: Mode = 'contains';
  if (prefix !== '') {
    field = prefix[0].toLowerCase() === 'k' ? 'keyword' : 'head';
    const starts = prefix.includes('^');
    const ends = prefix.includes('$');
    if (starts && ends) mode = 'exact';
    else if (starts) mode = 'starts';
    else if (ends) mode = 'ends';
  }

  return { negate, field, mode, value: lower(value) };
}

/** 对一个条目求值单个条件。 */
function termMatches(term: CompiledTerm, item: Item): boolean {
  const haystack =
    term.field === 'full'
      ? itemText(item)
      : term.field === 'keyword'
        ? lower(item.keywordLine)
        : lower(item.headKeyword);

  const base =
    term.mode === 'contains'
      ? haystack.includes(term.value)
      : term.mode === 'starts'
        ? haystack.startsWith(term.value)
        : term.mode === 'ends'
          ? haystack.endsWith(term.value)
          : haystack === term.value;

  return term.negate ? !base : base;
}

export function buildQuery(queryText: string): (item: Item) => boolean {
  const text = queryText.trim();
  if (text === '') return () => true;

  const groups = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .split(/\s+/)
        .map(parseTerm)
        .filter((t): t is CompiledTerm => t !== null),
    )
    .filter((terms) => terms.length > 0);

  // 全为空行 / 全为无值算子 → 无条件，全部命中
  if (groups.length === 0) return () => true;

  return (item) => groups.some((terms) => terms.every((t) => termMatches(t, item)));
}

/** 词库条目：关键词行出现过的词及其出现次数。 */
export interface VocabEntry {
  word: string;
  count: number;
}

/** 聚合一组词：按出现次数降序、同词频按首见顺序去重。 */
function aggregateVocabulary(words: Iterable<string>): VocabEntry[] {
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 聚合全部条目「关键词行」出现过的词，按出现次数降序、同词频按首见顺序去重。
 * 仅来自关键词行（其他行不参与）；用于搜索框自动补全的候选词库。
 */
export function buildVocabulary(items: Item[]): VocabEntry[] {
  return aggregateVocabulary(items.flatMap((item) => item.keywordLine.split(/\s+/)));
}

/**
 * 聚合全部条目的「首词」，排序/去重规则与 `buildVocabulary` 一致。
 * 用于 `h:` 系列前缀后的自动补全（首词匹配范围，避免给出必然零结果的候选）。
 */
export function buildHeadVocabulary(items: Item[]): VocabEntry[] {
  return aggregateVocabulary(items.map((item) => item.headKeyword));
}
