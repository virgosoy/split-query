import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('不足 1 KB 时按整数字节显示', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('1024 起进位到 KB / MB / GB，保留一位小数', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1234567)).toBe('1.2 MB'); // 1.1773… MB，四舍五入到一位
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('四舍五入触到下一级时不显示 1024.0', () => {
    expect(formatBytes(1048575)).toBe('1.0 MB'); // 1023.999 KB，四舍五入后进位
    expect(formatBytes(1073741823)).toBe('1.0 GB'); // 1023.999 MB，同理
  });
});
