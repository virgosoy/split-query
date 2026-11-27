import { describe, expect, it } from 'vitest';
import { completions, editSearchText, FIELD_OPS, type FieldOp } from './search-text';
import { splitToken } from './query';

describe('editSearchText — fieldOp', () => {
  // 矩阵：[类别, 原文本, 算子, 预期文本]
  const matrix: Array<[string, string, FieldOp, string]> = [
    ['空文本直接接算子', '', 'k^:', 'k^:'],
    ['行尾换行直接接算子', 'foo\n', 'k^:', 'foo\nk^:'],
    ['裸词前置算子', 'vue', 'k^:', 'k^:vue'],
    ['替换已有 k: 前缀', 'k:vue', 'k^:', 'k^:vue'],
    ['h: 替换为 k:', 'h:vue', 'k:', 'k:vue'],
    ['保留取反', '!vue', 'k$:', '!k$:vue'],
    ['保留取反并替换已有前缀', '!h:vue', 'k:', '!k:vue'],
    ['空 value 只换前缀', 'k:', 'k^:', 'k^:'],
    ['多行只改末行', 'foo\nbar', 'k:', 'foo\nk:bar'],
    ['末行空白重排', 'a   b  ', 'k:', 'a k:b'],
    ['非法锚点顺序按裸词前置', 'k$^:vue', 'k^:', 'k^:k$^:vue'],
  ];

  it.each(matrix)('%s：%j + %s → %j', (_label, text, op, expected) => {
    expect(editSearchText(text, { kind: 'fieldOp', op })).toBe(expected);
  });
});

describe('editSearchText — toggleExclude', () => {
  // 矩阵：[类别, 原文本, 预期文本]
  const matrix: Array<[string, string, string]> = [
    ['裸词取反', 'vue', '!vue'],
    ['已取反则取消', '!vue', 'vue'],
    ['字段算子前取反', 'k:vue', '!k:vue'],
    ['多行只改末词', 'foo\nvue', 'foo\n!vue'],
    ['无 token 不变', '', ''],
    ['仅空白不变', 'foo\n   ', 'foo\n   '],
    ['末行空白重排', 'a   b', 'a !b'],
  ];

  it.each(matrix)('%s：%j → %j', (_label, text, expected) => {
    expect(editSearchText(text, { kind: 'toggleExclude' })).toBe(expected);
  });
});

describe('editSearchText — complete', () => {
  // 矩阵：[类别, 原文本, 补全词, 预期文本]。只替换值；`!` 与原前缀逐字保留。
  const matrix: Array<[string, string, string, string]> = [
    ['替换裸末词', 'vu', 'vue', 'vue'],
    ['多行只改末词', 'foo\nvu', 'vue', 'foo\nvue'],
    ['保留取反', '!vu', 'vue', '!vue'],
    ['保留字段前缀', 'k:vu', 'vue', 'k:vue'],
    ['保留锚点前缀', 'k^:vu', 'vue', 'k^:vue'],
    ['保留取反与字段前缀', '!k:vu', 'vue', '!k:vue'],
    ['全角冒号原样保留', 'k：vu', 'vue', 'k：vue'],
    ['大写前缀与全角冒号原样保留', 'K^：VU', 'vue', 'K^：vue'],
    ['空值前缀只补值', 'k:', 'vue', 'k:vue'],
    ['空值取反只补值', '!', 'vue', '!vue'],
    ['多 token 只改末词', 'k:百度 vu', 'vue', 'k:百度 vue'],
    ['空文本不变', '', 'vue', ''],
    ['空白末行不变', 'foo\n   ', 'vue', 'foo\n   '],
  ];

  it.each(matrix)('%s：%j + %j → %j', (_label, text, word, expected) => {
    expect(editSearchText(text, { kind: 'complete', word })).toBe(expected);
  });
});

describe('completions — 按值匹配与词表分工', () => {
  const vocab = {
    keyword: ['vue', 'vite', 'Vuex', 'vues', 'router', 'v'],
    head: ['vue', 'Vuex', 'vhead', '常用搜索'],
  };

  // 矩阵：[类别, 搜索文本, 预期候选]
  const matrix: Array<[string, string, string[]]> = [
    ['裸词用关键词行词库', 'v', ['vue', 'vite', 'Vuex', 'vues']],
    ['k: 用关键词行词库', 'k:v', ['vue', 'vite', 'Vuex', 'vues']],
    ['k^: 用关键词行词库', 'k^:v', ['vue', 'vite', 'Vuex', 'vues']],
    ['大写前缀+全角冒号用关键词行词库', 'K^：v', ['vue', 'vite', 'Vuex', 'vues']],
    ['取反不再屏蔽候选', '!v', ['vue', 'vite', 'Vuex', 'vues']],
    ['取反+字段前缀不再屏蔽候选', '!k:v', ['vue', 'vite', 'Vuex', 'vues']],
    ['h: 用首词词库', 'h:v', ['vue', 'Vuex', 'vhead']],
    ['h^: 锚点前缀同样用首词词库', 'h^:v', ['vue', 'Vuex', 'vhead']],
    ['取反+h: 用首词词库', '!h:v', ['vue', 'Vuex', 'vhead']],
    ['h: 中文值匹配首词', 'h:常', ['常用搜索']],
    ['多 token 只看末词', 'k:百度 vu', ['vue', 'Vuex', 'vues']],
    ['多行只看末行末词', 'foo\nh:vu', ['vue', 'Vuex']],
    ['值为空→关键词词表前 8', 'k:', ['vue', 'vite', 'Vuex', 'vues', 'router', 'v']],
    ['锚点+空值→关键词词表前 8', 'k^:', ['vue', 'vite', 'Vuex', 'vues', 'router', 'v']],
    ['h: 空值→首词词表前 8', 'h:', ['vue', 'Vuex', 'vhead', '常用搜索']],
    ['裸 ! 空值→关键词词表前 8', '!', ['vue', 'vite', 'Vuex', 'vues', 'router', 'v']],
  ];

  it.each(matrix)('%s：%j', (_label, text, expected) => {
    expect(completions(text, vocab)).toEqual(expected);
  });

  it('输入大小写不敏感，排除与输入完全相等', () => {
    expect(completions('VUE', vocab)).toEqual(['Vuex', 'vues']);
    expect(completions('k:VUE', vocab)).toEqual(['Vuex', 'vues']);
  });

  it('上限 8', () => {
    const many = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'];
    expect(completions('a', { keyword: many, head: [] })).toEqual(many.slice(0, 8));
  });

  it.each([
    ['空文本', ''],
    ['仅空白', '   '],
  ])('%s 返回空', (_label, text) => {
    expect(completions(text, vocab)).toEqual([]);
  });
});

describe('FIELD_OPS 与共享 grammar 一致', () => {
  it.each(FIELD_OPS)('$op 被 splitToken 识别为同值前缀', ({ op }) => {
    expect(splitToken(op + 'x')).toEqual({ negate: false, prefix: op, value: 'x' });
  });
});
