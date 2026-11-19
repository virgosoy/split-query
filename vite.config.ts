import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    // 允许以 file:// 之外的本地预览方式；dev 无需改
    host: true,
  },
  build: {
    // 目标设备含 iOS 16.1.1（Safari 16.1）：把产物语法钉到 Safari 16 以保兼容
    target: 'safari16',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
