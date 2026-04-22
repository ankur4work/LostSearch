# Multi-stage build — supports running BOTH the Next.js web server
# (CMD default) AND the BullMQ worker (override CMD to `pnpm worker`)
# from the same image. For Coolify we deploy the same image twice with
# different start commands.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
# `|| pnpm install` handles the case where the committed lockfile drifted
# from package.json during rapid dev. On stable releases we want frozen.
RUN pnpm install --frozen-lockfile || pnpm install

# ---- build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Full source tree + node_modules — needed because the worker entrypoint
# (jobs/worker.ts) is tsx-executed at runtime and imports from lib/,
# server/, jobs/. Standalone-only output would omit these.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/jobs ./jobs
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/server ./server
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs

USER nextjs
EXPOSE 3000

# Default command is the web server. Worker container overrides this with
# `pnpm worker` via Coolify's "Custom Start Command" field.
CMD ["pnpm", "start"]
