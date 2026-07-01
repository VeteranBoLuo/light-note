import { defineConfig } from 'vitest/config';
import path from 'path';

// 独立的 vitest 配置(不复用 vite.config.ts,避免 CDN 等插件干扰测试),仅保留 @ 别名。
export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: 'assets', replacement: path.resolve(__dirname, 'src/assets') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
