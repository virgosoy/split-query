/**
 * query seam：搜索文本 → (条目)=>boolean（纯函数，v1 的检索边界）。
 *
 * 仅支持裸词（全文子串、拉丁词大小写不敏感）：同行空格=AND、行间=OR；
 * 空/仅空白查询=全部命中；谓词不改变条目顺序。
 * （k:/h:/锚点/! 等算子由 ticket 03 扩展。）
 */
import type { Item } from './parse';

/** 整条目文本（关键词行 + 其他行），小写化以支持拉丁词大小写不敏感匹配。 */
function itemText(item: Item): string {
  return [item.keywordLine, ...item.otherLines].join('\n').toLowerCase();
}

export function buildQuery(queryText: string): (item: Item) => boolean {
  const text = queryText.trim();
  if (text === '') return () => true;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const groups = lines.map((line) => {
    const terms = line.split(/\s+/).map((term) => term.toLowerCase());
    return (item: Item) => terms.every((term) => itemText(item).includes(term));
  });

  return (item) => groups.some((group) => group(item));
}
