import { defineConfig } from 'vitest/config';

// Pin discovery to THIS package so a walked-up ancestor vitest.config.ts
// (vitest searches upward from CWD) cannot hijack test collection — forcing
// jsdom, a foreign setup file, or a stray include glob. This package is pure
// TypeScript with zero DOM dependencies: the node environment is correct and
// rooting at __dirname keeps discovery inside the repo.
export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
