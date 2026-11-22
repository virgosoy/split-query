/**
 * order seam：条目排序的纯函数（v1.1 按需随机排序）。
 *
 * shuffle 使用 Fisher–Yates，随机源注入以便测试；不修改入参。
 * 随机排列的消费方式：对全部条目滚一次，搜索只取该排列的子序列，
 * 因此输入过程中结果先后保持稳定（见 spec 的「v1.1 追加」）。
 */

/** 随机源：返回 [0, 1) 的均匀随机数。 */
export type RandomSource = () => number;

/**
 * 返回 items 的一个随机排列（新数组，入参不变）。
 * random 缺省为 Math.random；测试传入固定序列以获得确定结果。
 */
export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
