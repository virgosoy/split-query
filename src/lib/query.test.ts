import { describe, expect, it } from 'vitest';
import { buildQuery } from './query';
import type { Item } from './parse';

const items: Item[] = [
  { keywordLine: 'vue router 前端', headKeyword: 'vue', otherLines: ['https://router.vuejs.org/'] },
  { keywordLine: '百度 搜索 国内', headKeyword: '百度', otherLines: ['https://baidu.com'] },
  { keywordLine: '混元 国内 新', headKeyword: '混元', otherLines: [] },
  { keywordLine: '常用搜索', headKeyword: '常用搜索', otherLines: ['百度 国内 快 1-', '必应 国外'] },
];

function matchesLines(query: string): string[] {
  return items.filter(buildQuery(query)).map((it) => it.keywordLine);
}

describe('buildQuery — 裸词语法矩阵', () => {
  // 矩阵：[类别, 查询, 预期命中的关键词行（顺序=文件顺序）]
  const matrix: Array<[string, string, string[]]> = [
    ['单词·子串', 'vue', ['vue router 前端']],
    ['单词·子串(其他行)', '国内', ['百度 搜索 国内', '混元 国内 新', '常用搜索']],
    ['同行=AND', 'vue router', ['vue router 前端']],
    ['同行=AND·无交集', 'vue 百度', []],
    ['行间=OR', 'vue\n百度', ['vue router 前端', '百度 搜索 国内', '常用搜索']],
    ['行间=OR·无命中项', '国内\ngithub', ['百度 搜索 国内', '混元 国内 新', '常用搜索']],
    ['拉丁词·大小写不敏感', 'VUE', ['vue router 前端']],
    ['拉丁词·子串大小写不敏感', 'Router', ['vue router 前端']],
    ['命中其他行中的 URL 文本', 'router.vuejs', ['vue router 前端']],
    ['命中其他行中的 URL 文本2', 'baidu.com', ['百度 搜索 国内']],
    ['空查询=全部', '', items.map((i) => i.keywordLine)],
    ['仅空白查询=全部', '   \n  ', items.map((i) => i.keywordLine)],
  ];

  it.each(matrix)('%s：%j → %j', (_label, query, expected) => {
    expect(matchesLines(query)).toEqual(expected);
  });
});
