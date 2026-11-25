/**
 * parse seam：文本 → 条目[]（纯函数，v1 唯一的数据解析边界）。
 *
 * 领域概念见根目录 GLOSSARY.md：
 * 条目 Item、关键词行 keywordLine、首词 headKeyword、其他行 otherLines。
 */
export interface Item {
  /** 关键词行：条目第一行原文 */
  keywordLine: string;
  /** 首词：关键词行第一个空格分隔词 */
  headKeyword: string;
  /** 其他行：首行之后的各行；可能为 URL，也可能为普通文本，可为空 */
  otherLines: string[];
}

/** 判断一行是否为可点击的 http(s) 链接（调用方传入的行已去首尾空白）。 */
export function isHttpUrl(line: string): boolean {
  return /^https?:\/\//i.test(line);
}

/** 一条 URL 行拆出的 URL 与描述。 */
export interface UrlLine {
  /** 第一个空白前的 URL 部分（保留原大小写）。 */
  url: string;
  /** 空白之后的描述；没有时为 ''（已去首尾空白，内部空白保留）。 */
  note: string;
}

/**
 * 拆 URL 行：URL = 第一个空白串之前，描述 = 其后。
 * 非 http(s) 行返回 null；调用方传入的行已去首尾空白（与 isHttpUrl 一致）。
 */
export function splitUrlLine(line: string): UrlLine | null {
  if (!isHttpUrl(line)) return null;
  const match = /^(\S+)(?:\s+(.*))?$/.exec(line);
  if (match === null) return null;
  return { url: match[1], note: (match[2] ?? '').trim() };
}

/** 文本 → 条目[]。按空行切分，忽略文件首尾与多余空行；行内容去首尾空白。 */
export function parseFile(text: string): Item[] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map((block) => {
    const [keywordLine, ...otherLines] = block;
    return {
      keywordLine,
      headKeyword: keywordLine.split(/\s+/)[0],
      otherLines,
    };
  });
}
