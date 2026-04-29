# Releasing

This repo publishes [`create-acme-platform`](https://www.npmjs.com/package/create-acme-platform) to npm. The package is a CLI scaffolding tool — not the apps themselves.

## How the CLI Is Packaged

The source lives in `packages/cli/src/` (TypeScript). The release pipeline:

1. **tsup** bundles `src/index.ts` → `packages/cli/dist/index.mjs`
2. **`build-create-package.mjs`** assembles `dist/create-acme-platform/`:
   - Copies the bundled CLI to `dist/create-acme-platform/bin/create-acme-platform.mjs`
   - Copies the repo's full template (excluding dev-only dirs like `.claude`, `node_modules`, `packages/cli`, etc.)
   - Sanitizes the template's `package.json` (removes repo-only scripts and metadata)
   - Writes the publish `package.json` with version, bin entry, and runtime deps
   - Generates a README and copies the LICENSE
3. **`verify-create-package.mjs`** smoke-tests the assembled package end-to-end
4. **GitHub Actions** `npm publish ./dist/create-acme-platform` on `v*` tag push

## Release Commands

```bash
pnpm release:patch    # 0.x.y → 0.x.(y+1)
pnpm release:minor    # 0.x.y → 0.(x+1).0
pnpm release:major    # 0.x.y → (x+1).0.0
```

Each command uses `standard-version` to:

- Bump the version in `package.json`
- Append an entry to `CHANGELOG.md`
- Create a git commit: `chore: release vX.Y.Z`
- Create a git tag: `vX.Y.Z`

## Pre-Push Guard

A Husky `pre-push` hook blocks tag pushes unless `pnpm release:verify` passes first.

```
git push origin v0.3.0
  → pre-push hook detects tag ref
  → runs pnpm release:verify
      → builds packages/cli (tsup)
      → assembles dist/create-acme-platform/
      → validates all required paths exist
      → runs CLI with --yes on a temp dir
      → npm pack → npm install → runs CLI from tarball
      → pnpm install + lint + typecheck + build on scaffolded output
  → if any step fails: push is blocked
  → if all pass: push proceeds
```

This means a broken CLI can never reach npm — the verify step catches it before GitHub Actions even runs.

## Full Release Flow

```bash
# 1. Make your changes and commit them to main

# 2. Bump the version (creates commit + tag)
pnpm release:minor

# 3. Review the generated CHANGELOG.md and commit if looks good

# 4. Push the commit and tag
git push origin main
git push origin vX.Y.Z
# ↑ pre-push hook runs release:verify here — blocks if anything is broken

# 5. Watch GitHub Actions
# The release workflow runs: lint → typecheck → test → build → build-package → verify → publish → GitHub release
```

## Validation Commands (run manually at any time)

```bash
# Build packages/cli and assemble dist/create-acme-platform/
pnpm release:build-package

# Run the full end-to-end smoke test on the assembled package
pnpm release:verify

# Preview what npm pack would include (no publish)
pnpm release:pack:dry-run
```

## GitHub Actions Release Workflow

File: `.github/workflows/release.yml`

Trigger: push to tags matching `v*`

Steps in order:

| Step           | Command                                   | Purpose                                      |
| -------------- | ----------------------------------------- | -------------------------------------------- |
| Checkout       | `actions/checkout@v4`                     | Full history for release notes               |
| Setup monorepo | `.github/actions/setup-monorepo`          | pnpm install --frozen-lockfile               |
| Write CI env   | `.github/actions/write-ci-env`            | Synthetic env files for build/test           |
| Lint           | `pnpm lint`                               | ESLint across workspace                      |
| Typecheck      | `pnpm typecheck`                          | tsc --noEmit across workspace                |
| Test           | `pnpm test`                               | Vitest across workspace                      |
| Build          | `pnpm build`                              | Full workspace build (includes packages/cli) |
| Build package  | `pnpm release:build-package`              | Assemble dist/create-acme-platform/          |
| Verify         | `node scripts/verify-create-package.mjs`  | End-to-end smoke test                        |
| Publish        | `npm publish ./dist/create-acme-platform` | Push to npm registry                         |
| GitHub Release | `softprops/action-gh-release@v2`          | Create release with CHANGELOG notes          |

If any step fails, subsequent steps are skipped — the npm publish step never fires on a broken build.

## npm Authentication

Two options:

**Option A — NPM_TOKEN (recommended for most repos)**

1. Generate a Granular Access Token on npmjs.com scoped to the `create-acme-platform` package with `read and write` permission
2. Add it as a GitHub Actions secret named `NPM_TOKEN` in the `Production` environment
3. The workflow uses `npm whoami` to validate the token before publishing

**Option B — npm Trusted Publishing (no long-lived token)**

1. Configure npm Trusted Publishing for this repository and the `release.yml` workflow file
2. Leave `NPM_TOKEN` unset in GitHub Actions
3. The workflow publishes via GitHub OIDC — no token stored anywhere

## What Gets Published

The npm package `create-acme-platform` contains:

```
bin/
  create-acme-platform.mjs   CLI binary (bundled from packages/cli)
template/
  apps/                      Full Next.js + Hono starter
  packages/                  All shared packages (except packages/cli)
  infra/                     Observability stack config
  scripts/prepare.mjs        Post-scaffold git hook setup
  .github/workflows/ci.yml   CI workflow
  .github/workflows/database-migrate.yml
  package.json               Sanitized (repo-only scripts removed)
  pnpm-lock.yaml
  pnpm-workspace.yaml
  turbo.json
  docker-compose.yml
  eslint.config.mjs
  .env.example
  .gitignore
  .dockerignore
  .husky/
  docs/
  LICENSE
  README.md
package.json                 Publish manifest
README.md                    Generated CLI usage README
LICENSE
```

Excluded from the template: `.git`, `.agents`, `.claude`, `.vscode`, `.idea`, `node_modules`, `dist`, `coverage`, `.next`, `packages/cli`, `test-results`, `.github/workflows/release.yml`
