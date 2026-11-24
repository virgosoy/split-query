import { describe, expect, it } from 'vitest';
import { buildQuery, buildVocabulary, splitToken } from './query';
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

describe('buildQuery — 算子（k:/h:/锚点/大小写/全角冒号/!）', () => {
  // 矩阵：[类别, 查询, 预期命中的关键词行（顺序=文件顺序）]
  const matrix: Array<[string, string, string[]]> = [
    ['k:·关键词行包含', 'k:国内', ['百度 搜索 国内', '混元 国内 新']],
    ['k:·仅限关键词行（其他行不算）', 'k:百度', ['百度 搜索 国内']],
    ['h:·仅首词', 'h:搜索', ['常用搜索']],
    ['h:·排除其他行命中', 'h:百度', ['百度 搜索 国内']],
    ['k^:开头', 'k^:v', ['vue router 前端']],
    ['k$:结尾', 'k$:前端', ['vue router 前端']],
    ['k^$:关键词行精确（单 token 行）', 'k^$:常用搜索', ['常用搜索']],
    ['h^:首词开头', 'h^:常', ['常用搜索']],
    ['h$:首词结尾', 'h$:e', ['vue router 前端']],
    ['h^$:首词精确', 'h^$:常用搜索', ['常用搜索']],
    ['算子大小写不敏感', 'H:搜索', ['常用搜索']],
    ['全角冒号等价', 'k：vue', ['vue router 前端']],
    ['大小写+全角冒号+锚点', 'K^：VUE', ['vue router 前端']],
    ['!裸词·全文取反', 'vue !router', []],
    ['!裸词·排除其他行命中', '国内 !百度', ['混元 国内 新']],
    ['!k:·关键词行取反', '!k:vue', ['百度 搜索 国内', '混元 国内 新', '常用搜索']],
    ['!k：·全角冒号取反', '!k：百度', ['vue router 前端', '混元 国内 新', '常用搜索']],
    ['行内多条件组合', 'k:国内 !k:百度', ['混元 国内 新']],
    ['行间=OR·带算子', 'k:国内\nh:搜索', ['百度 搜索 国内', '混元 国内 新', '常用搜索']],
  ];

  it.each(matrix)('%s：%j → %j', (_label, query, expected) => {
    expect(matchesLines(query)).toEqual(expected);
  });
});

describe('buildVocabulary — 补全词库', () => {
  it('聚合各条目关键词行的词，按出现次数降序，去重且其余行不参与', () => {
    const vocab = buildVocabulary(items);
    expect(vocab.map((v) => v.word)).toEqual([
      '国内', // 出现 2 次（×2 条目关键词行）
      'vue', 'router', '前端', '百度', '搜索', '混元', '新', '常用搜索', // 各 1 次，按首见顺序
    ]);
  });

  it('同关键词行内重复的词按出现次数计数', () => {
    const v = buildVocabulary([
      { keywordLine: 'a a b', headKeyword: 'a', otherLines: ['a'] }, // 其他行不计
    ]);
    expect(v).toEqual([
      { word: 'a', count: 2 },
      { word: 'b', count: 1 },
    ]);
  });

  it('空条目集返回空词库', () => {
    expect(buildVocabulary([])).toEqual([]);
  });
});

describe('splitToken — 共享 grammar', () => {
  // 矩阵：[输入, 预期（negate/prefix/value；prefix 与 value 保留原文）]
  const matrix: Array<[string, { negate: boolean; prefix: string; value: string }]> = [
    ['vue', { negate: false, prefix: '', value: 'vue' }],
    ['!vue', { negate: true, prefix: '', value: 'vue' }],
    ['k:vue', { negate: false, prefix: 'k:', value: 'vue' }],
    ['k^:vue', { negate: false, prefix: 'k^:', value: 'vue' }],
    ['h$:vue', { negate: false, prefix: 'h$:', value: 'vue' }],
    ['k^$:vue', { negate: false, prefix: 'k^$:', value: 'vue' }],
    ['!k:vue', { negate: true, prefix: 'k:', value: 'vue' }],
    ['k：vue', { negate: false, prefix: 'k：', value: 'vue' }], // 全角冒号，prefix 保留全角原文
    ['K^：Vue', { negate: false, prefix: 'K^：', value: 'Vue' }], // 原文大小写保留
    ['k:', { negate: false, prefix: 'k:', value: '' }], // 算子后无值
    ['k$^:vue', { negate: false, prefix: '', value: 'k$^:vue' }], // 非法锚点顺序不作前缀
  ];

  it.each(matrix)('%j → %j', (token, expected) => {
    expect(splitToken(token)).toEqual(expected);
  });
});
