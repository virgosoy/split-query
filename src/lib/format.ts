const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** 字节 → 人类可读（1024 进制，一位小数；不加"约"——数是被量出来的，不是估算的）。 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  // 循环退出时 value < 1024，故 rounded 至多恰好 1024——那不是"1024.0 KB"，而是下一级的 1.0
  if (rounded >= 1024 && unit < UNITS.length - 1) return `1.0 ${UNITS[unit + 1]}`;
  return unit === 0 ? `${rounded} B` : `${rounded.toFixed(1)} ${UNITS[unit]}`;
}
