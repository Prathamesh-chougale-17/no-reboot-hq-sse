#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const gitMetadataPath = join(process.cwd(), '.git');

if (!existsSync(gitMetadataPath)) {
  console.log('[prepare] Skipping Husky installation because no .git metadata was found.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'husky'], {
  cwd: process.cwd(),
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error('[prepare] Failed to run Husky setup.', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
