import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts'],
  format: ['cjs'],
  sourcemap: true,
  clean: true,
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  bundle: true,
  noExternal: [/^@acme\//],
  external: ['hono', '@hono/node-server', '@hono/zod-validator', '@sentry/node', 'prom-client'],
  outExtension: () => ({
    js: '.cjs',
  }),
});
