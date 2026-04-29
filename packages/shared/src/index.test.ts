import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AccountSignUpInputSchema, CreateInvitationInputSchema, UserDtoSchema } from './contracts';
import { APP_VERSION } from './constants';

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(resolve(currentDir, '../../../package.json'), 'utf8'),
) as { version: string };
const require = createRequire(import.meta.url);
const appVersionUpdater = require(
  resolve(currentDir, '../../../scripts/standard-version-app-version-updater.cjs'),
) as {
  readVersion(contents: string): string;
  writeVersion(contents: string, version: string): string;
};

describe('shared contracts', () => {
  it('normalizes the sign-up payload', () => {
    const result = AccountSignUpInputSchema.parse({
      name: 'Ada Lovelace',
      email: 'ADA@EXAMPLE.COM',
      password: 'super-secure-password',
    });

    expect(result.email).toBe('ada@example.com');
  });

  it('normalizes invitation payloads', () => {
    const result = CreateInvitationInputSchema.parse({
      email: 'INVITED@EXAMPLE.COM',
      role: 'admin',
    });

    expect(result.email).toBe('invited@example.com');
    expect(result.role).toBe('admin');
  });

  it('supports nullable auth profile fields', () => {
    const result = UserDtoSchema.parse({
      id: crypto.randomUUID(),
      name: null,
      email: 'member@example.com',
      emailVerified: false,
      image: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result.name).toBeNull();
    expect(result.image).toBeNull();
  });

  it('keeps the runtime version aligned with the package version', () => {
    expect(APP_VERSION).toBe(rootPackageJson.version);
  });

  it('lets standard-version update the runtime version constant', () => {
    const source =
      "export const APP_VERSION = '1.2.3';\nexport const SUPPORT_EMAIL = 'support@example.com';\n";

    expect(appVersionUpdater.readVersion(source)).toBe('1.2.3');
    expect(appVersionUpdater.writeVersion(source, '1.2.4')).toBe(
      "export const APP_VERSION = '1.2.4';\nexport const SUPPORT_EMAIL = 'support@example.com';\n",
    );
  });
});
