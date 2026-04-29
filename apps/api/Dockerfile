FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @acme/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
CMD ["node", "dist/index.cjs"]
