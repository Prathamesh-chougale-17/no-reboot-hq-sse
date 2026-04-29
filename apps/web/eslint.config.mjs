import { defineConfig } from 'eslint/config';

import nextConfig from '../../packages/eslint-config/next.js';

export default defineConfig([...nextConfig]);
