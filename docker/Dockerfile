# Multi-stage build — supports running BOTH the Next.js web server
# (CMD default) AND the BullMQ worker (override CMD to `pnpm worker`)
# from the same image. For Coolify we deploy the same image twice with
# different start commands.

FROM node:20-alpine AS base
# OpenSSL: required at runtime by Prisma's query engine on Alpine.
# libc6-compat: required by some native modules (sharp, msgpackr-extract).
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
# `--prod=false` forces pnpm to install devDependencies even when Coolify
# injects NODE_ENV=production via build ARGs. We need prisma + typescript +
# next CLI at build time — they live in devDependencies.
# `|| pnpm install` handles the missing-lockfile case for first deploys.
RUN pnpm install --frozen-lockfile --prod=false || pnpm install --prod=false

# ---- build ----
FROM base AS builder

# Next.js evaluates route modules at build time (for sitemap.xml, static
# metadata, etc.). Those modules import lib/env.ts, which validates env
# vars via Zod and throws on missing. Coolify passes env vars as build
# ARGs — we must declare them here so the Zod validator sees real values.
# Declaring them as ENV (not just ARG) so nested shell commands see them.
ARG SHOPIFY_API_KEY
ARG SHOPIFY_API_SECRET
ARG SHOPIFY_APP_URL
ARG SHOPIFY_SCOPES
ARG DATABASE_URL
ARG REDIS_URL
ARG SESSION_SECRET
ARG NODE_ENV=production
ARG LOG_LEVEL=info
ARG FROM_EMAIL
ARG SUPPORT_EMAIL
ARG COMPANY_ADDRESS
ARG PRIVACY_CONTACT_EMAIL

ENV SHOPIFY_API_KEY=$SHOPIFY_API_KEY \
    SHOPIFY_API_SECRET=$SHOPIFY_API_SECRET \
    SHOPIFY_APP_URL=$SHOPIFY_APP_URL \
    SHOPIFY_SCOPES=$SHOPIFY_SCOPES \
    DATABASE_URL=$DATABASE_URL \
    REDIS_URL=$REDIS_URL \
    SESSION_SECRET=$SESSION_SECRET \
    NODE_ENV=$NODE_ENV \
    LOG_LEVEL=$LOG_LEVEL \
    FROM_EMAIL=$FROM_EMAIL \
    SUPPORT_EMAIL=$SUPPORT_EMAIL \
    COMPANY_ADDRESS=$COMPANY_ADDRESS \
    PRIVACY_CONTACT_EMAIL=$PRIVACY_CONTACT_EMAIL

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
# /app/public is optional — Next serves static assets from there if present.
# We don't ship any yet, so the folder doesn't exist in the repo and we skip
# the COPY. Add `public/.gitkeep` and re-enable this line when you have assets.
# COPY --from=builder --chown=nextjs:nodejs /app/public ./public
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
