# Generated Admin GraphQL types

This directory holds types produced by `pnpm codegen`. It intentionally does
not ship with pre-generated files — run:

```
pnpm codegen
```

to produce `admin.ts` from the 2025-04 schema. Commit the result so CI and
production builds don't hit Shopify's schema endpoint.

The ingestion modules carry hand-written response interfaces as a safety net
until codegen is wired; once `admin.ts` is generated, replace those interfaces
with `import type { ... } from '@/lib/shopify/generated/admin'`.
