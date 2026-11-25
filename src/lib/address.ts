/**
 * address seam：地址条目的基址池与链接的替代前缀（纯函数）。
 *
 * 领域概念见 GLOSSARY.md：
 * 地址条目 address item、替代前缀 alternative prefix。
 */
import { splitUrlLine, type Item } from './parse';

/** 地址条目的首词（严格相等）。 */
const ADDRESS_HEAD = '地址';

/** 规范化基址键：scheme 与 authority 小写，端口保留。 */
type PrefixKey = string;

/** 地址行提供的基址：原样前缀（含尾斜杠）与比较键。 */
interface Base {
  prefix: string;
  key: PrefixKey;
}

/** 规范化键 → 该基址可用的替代前缀（文件顺序、按规范化键去重、含尾斜杠）。 */
export type AddressPool = ReadonlyMap<PrefixKey, readonly string[]>;

/** 链接的替代项。 */
export interface AlternativeLink {
  /** chip 文本：替代前缀去掉尾斜杠（保留文件原样大小写）。 */
  prefix: string;
  /** 替代前缀 + 原链接的路径/查询/哈希。 */
  href: string;
}

/** 首词严格为「地址」的条目。 */
export function isAddressItem(item: Item): boolean {
  return item.headKeyword === ADDRESS_HEAD;
}

/**
 * 把一条 http(s) URL 行拆成规范化基址键、原样前缀与余下部分。
 * 行内空白之后的描述被忽略（见 parse seam 的 `splitUrlLine`）；
 * 余下部分去掉基址后的第一个 '/'：`/a?b` → `a?b`，`?b` → `?b`，空 → 空。
 * 非 http(s) 或没有 authority 时返回 null。
 */
function splitUrl(line: string): { prefix: string; key: PrefixKey; suffix: string } | null {
  const urlLine = splitUrlLine(line);
  if (urlLine === null) return null;
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)(.*)$/.exec(urlLine.url);
  if (match === null) return null;
  const scheme = match[1];
  const authority = match[2];
  if (authority === '') return null;
  const rest = match[3];
  return {
    prefix: `${scheme}://${authority}/`,
    key: `${scheme.toLowerCase()}://${authority.toLowerCase()}/`,
    suffix: rest.startsWith('/') ? rest.slice(1) : rest,
  };
}

/** 地址行只贡献基址：路径、查询、哈希都忽略。 */
function baseOf(line: string): Base | null {
  const parts = splitUrl(line);
  return parts === null ? null : { prefix: parts.prefix, key: parts.key };
}

/** 一个地址条目的基址（按规范化键去重，保留首次出现的大小写与顺序）。 */
function basesOf(item: Item): Base[] {
  const seen = new Set<PrefixKey>();
  const bases: Base[] = [];
  for (const line of item.otherLines) {
    const base = baseOf(line);
    if (base === null || seen.has(base.key)) continue;
    seen.add(base.key);
    bases.push(base);
  }
  return bases;
}

/**
 * 从全部条目构建前缀池。
 * 地址条目的每个基址以「同条目内其他基址」为替代；多个地址条目共享同一基址时取并集。
 * 不产生替代的基址不进入池。
 */
export function buildAddressPool(items: readonly Item[]): AddressPool {
  const collected = new Map<PrefixKey, Base[]>();
  for (const item of items) {
    if (!isAddressItem(item)) continue;
    const bases = basesOf(item);
    for (const base of bases) {
      const alternatives = collected.get(base.key) ?? [];
      for (const other of bases) {
        if (other.key === base.key) continue;
        if (!alternatives.some((alt) => alt.key === other.key)) alternatives.push(other);
      }
      collected.set(base.key, alternatives);
    }
  }

  const pool = new Map<PrefixKey, readonly string[]>();
  for (const [key, alternatives] of collected) {
    if (alternatives.length === 0) continue;
    pool.set(
      key,
      alternatives.map((base) => base.prefix),
    );
  }
  return pool;
}

/** 该 URL 的替代链接（文件顺序）；不命中或没有替代时返回空数组。 */
export function alternativesFor(url: string, pool: AddressPool): AlternativeLink[] {
  const parts = splitUrl(url);
  if (parts === null) return [];
  const alternatives = pool.get(parts.key);
  if (alternatives === undefined) return [];
  return alternatives.map((prefix) => ({
    prefix: prefix.endsWith('/') ? prefix.slice(0, -1) : prefix,
    href: prefix + parts.suffix,
  }));
}
