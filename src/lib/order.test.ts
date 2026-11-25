import { describe, expect, it } from 'vitest';
import { reverse, shuffle } from './order';

/** 固定种子的伪随机源（LCG），仅用于断言性质，不参与期望排列的推导。 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('shuffle', () => {
  it('空数组 → 空数组', () => {
    expect(shuffle([], () => 0)).toEqual([]);
  });

  it('单元素 → 原样', () => {
    expect(shuffle(['a'], () => 0)).toEqual(['a']);
  });

  it('给定随机序列得到确定排列（手算示例）', () => {
    // Fisher–Yates 从末尾向前：i=2 时 j=floor(0.1*3)=0 → [c,b,a]；
    // i=1 时 j=floor(0.9*2)=1 → 原地交换，结果仍为 [c,b,a]。
    const values = [0.1, 0.9];
    let index = 0;
    expect(shuffle(['a', 'b', 'c'], () => values[index++])).toEqual(['c', 'b', 'a']);
  });

  it('不丢不重', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const output = shuffle(input, seededRandom(42));
    expect(output).toHaveLength(input.length);
    expect([...output].sort()).toEqual([...input].sort());
  });

  it('不修改入参，且返回新数组', () => {
    const input = Object.freeze(['a', 'b', 'c']);
    const output = shuffle(input, () => 0);
    expect(input).toEqual(['a', 'b', 'c']);
    expect(output).not.toBe(input);
  });

  it('同一随机序列 → 同一排列', () => {
    expect(shuffle([1, 2, 3, 4, 5], seededRandom(7))).toEqual(
      shuffle([1, 2, 3, 4, 5], seededRandom(7)),
    );
  });
});

describe('reverse', () => {
  it('条目整体倒序（手算示例）', () => {
    expect(reverse(['a', 'b', 'c'])).toEqual(['c', 'b', 'a']);
  });

  it('空数组 → 空数组', () => {
    expect(reverse([])).toEqual([]);
  });

  it('单元素 → 原样', () => {
    expect(reverse(['a'])).toEqual(['a']);
  });

  it('不修改入参，且返回新数组', () => {
    const input = Object.freeze(['a', 'b', 'c']);
    const output = reverse(input);
    expect(input).toEqual(['a', 'b', 'c']);
    expect(output).not.toBe(input);
  });
});
