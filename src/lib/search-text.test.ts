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
  // 矩阵：[类别, 原文本, 补全词, 预期文本]
  const matrix: Array<[string, string, string, string]> = [
    ['替换裸末词', 'vu', 'vue', 'vue'],
    ['多行只改末词', 'foo\nvu', 'vue', 'foo\nvue'],
    ['取反词不补全', '!vu', 'vue', '!vu'],
    ['字段前缀后不补全', 'k:vu', 'vue', 'k:vu'],
    ['锚点前缀后不补全', 'k^:vu', 'vue', 'k^:vu'],
    ['空文本不变', '', 'vue', ''],
    ['空白末行不变', 'foo\n   ', 'vue', 'foo\n   '],
  ];

  it.each(matrix)('%s：%j + %j → %j', (_label, text, word, expected) => {
    expect(editSearchText(text, { kind: 'complete', word })).toBe(expected);
  });
});

describe('completions — 前缀候选', () => {
  const words = ['vue', 'vite', 'Vuex', 'vues', 'router', 'v'];

  it('大小写不敏感前缀匹配，保持词库顺序，排除完全相等', () => {
    expect(completions('v', words)).toEqual(['vue', 'vite', 'Vuex', 'vues']);
  });

  it('输入大小写不敏感', () => {
    expect(completions('VUE', words)).toEqual(['Vuex', 'vues']);
  });

  it('只看当前行末词', () => {
    expect(completions('foo vu', words)).toEqual(['vue', 'Vuex', 'vues']);
  });

  it('上限 8', () => {
    const many = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'];
    expect(completions('a', many)).toEqual(many.slice(0, 8));
  });

  it.each([
    ['空文本', ''],
    ['仅空白', '   '],
    ['取反词', '!v'],
    ['字段前缀', 'k:v'],
    ['锚点前缀', 'k^:v'],
  ])('%s 返回空', (_label, text) => {
    expect(completions(text, words)).toEqual([]);
  });
});

describe('FIELD_OPS 与共享 grammar 一致', () => {
  it.each(FIELD_OPS)('$op 被 splitToken 识别为同值前缀', ({ op }) => {
    expect(splitToken(op + 'x')).toEqual({ negate: false, prefix: op, value: 'x' });
  });
});
