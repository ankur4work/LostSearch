# Contributing

## Code standards

- **TypeScript strict**, `noUncheckedIndexedAccess`. No `any`. No `@ts-ignore` — use a typed workaround and comment the reason.
- **UI**: Polaris only. Tailwind is utility-only (spacing/layout).
- **State**: tRPC for server-client; React Query cache is the source of truth on the client. No Redux.
- **Errors**: throw `TRPCError` from server procedures; thrown code paths land in the client mutation's `onError`. For API routes, return `NextResponse.json({ error }, { status })`.
- **Logging**: always `logger.*` from `lib/logger.ts`. Never `console.log`. ESLint enforces.
- **Secrets**: never commit. Everything through `lib/env.ts` (Zod).
- **Shopify**: never call from the browser. Always proxy through a server route.

## PR checklist

- [ ] Tests added or updated (vitest)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm test` passes
- [ ] No new `console.*`, no new `any`
- [ ] If DB schema changed: migration added + tested on a fresh DB
- [ ] If a new env var: added to `env.ts`, `.env.example`, and `README.md`
- [ ] If user-visible UI: Polaris components only, `accessibilityLabel` on interactive elements
- [ ] If a security-relevant change: note in `SECURITY.md`

## Review checklist

- [ ] Does the change respect the separation: pure engine / orchestration pipeline / I/O?
- [ ] Does any new endpoint validate input with Zod?
- [ ] Does any new endpoint rate-limit appropriately?
- [ ] Are error messages user-safe (no stack traces, no internal IDs)?
- [ ] Is any new merchant data in the PII inventory?
- [ ] Does any new Shopify API call use the `ShopifyClient` wrapper (so it inherits retries/rate-limit handling)?

## Running locally

See [README.md](README.md). Short version:

```
cp .env.example .env && fill in secrets
pnpm install
pnpm docker:up
pnpm prisma migrate dev
pnpm prisma:seed
pnpm dev
pnpm worker  # in a second terminal
```

## Commits

- Conventional commits preferred: `feat(dashboard):`, `fix(oauth):`, `docs:`, `test:`, etc.
- Breaking changes must be called out in the PR description and in the CHANGELOG.
