import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['tests/ui/**/*.test.{ts,tsx}', 'jsdom'],
      ['tests/email-digest.test.tsx', 'jsdom'],
    ],
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
