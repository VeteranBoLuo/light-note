import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
