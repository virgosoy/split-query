import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    // 允许以 file:// 之外的本地预览方式；dev 无需改
    host: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
