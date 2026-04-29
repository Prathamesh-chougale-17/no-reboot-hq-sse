import { defineConfig, globalIgnores } from 'eslint/config';

import baseConfig from './packages/eslint-config/base.js';
import nextConfig from './packages/eslint-config/next.js';
import reactConfig from './packages/eslint-config/react.js';

const scopeConfigs = (configs, files) =>
  configs.map((config) => {
    if (!config || typeof config !== 'object') {
      return config;
    }

    return {
      ...config,
      files,
    };
  });

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/dist/**',
    '**/.next/**',
    '**/playwright-report/**',
  ]),
  ...scopeConfigs(baseConfig, [
    '*.js',
    '*.mjs',
    '*.cjs',
    '*.ts',
    'apps/api/**/*.{js,mjs,cjs,ts}',
    'apps/web-e2e/**/*.{js,mjs,cjs,ts}',
    'packages/config/**/*.{js,mjs,cjs,ts}',
    'packages/db/**/*.{js,mjs,cjs,ts}',
    'packages/logger/**/*.{js,mjs,cjs,ts}',
    'packages/observability/**/*.{js,mjs,cjs,ts}',
    'packages/shared/**/*.{js,mjs,cjs,ts}',
    'packages/typescript-config/**/*.{js,mjs,cjs,ts}',
    'packages/eslint-config/**/*.{js,mjs,cjs,ts}',
  ]),
  ...scopeConfigs(reactConfig, ['packages/ui/**/*.{js,jsx,mjs,cjs,ts,tsx}']),
  {
    files: ['apps/web/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    settings: {
      next: {
        rootDir: 'apps/web',
      },
    },
  },
  ...scopeConfigs(nextConfig, ['apps/web/**/*.{js,jsx,mjs,cjs,ts,tsx}']),
]);
