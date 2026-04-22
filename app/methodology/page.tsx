import ReactMarkdown from 'react-markdown';
import { env } from '@/lib/env';

export const metadata = {
  title: 'Methodology · Search Failure Miner',
  description:
    'How Search Failure Miner classifies failed searches and estimates the revenue impact.',
  robots: { index: true, follow: true },
  alternates: { canonical: `${process.env.SHOPIFY_APP_URL ?? ''}/methodology` },
};

const METHODOLOGY_MD = `
# Methodology

Search Failure Miner reads Shopify's Search & Discovery analytics and your
product catalog, then classifies each search query into one of four types and
estimates the monthly revenue left on the table.

## How classification works

Every search query the last 30 days is pushed through a deterministic
8-step decision tree. The first rule that matches wins:

1. **Filter Gap (Type 4).** Query had filters applied *and* returned zero
   results. Confidence 0.95.
2. **Results No Click (Type 3).** Query returned ≥ 1 result but no one clicked,
   and it was asked ≥ 10 times. Confidence 0.80.
3. **Exact Match.** The query appears verbatim in a product title or tag —
   classified as fine.
4. **Keyword Mismatch (Type 2, fuzzy).** Fuse.js fuzzy search across your
   catalog titles + tags (and a bidirectional synonym index — including Hindi
   ↔ English ethnic wear terms for Indian merchants). A match below the
   configured fuzzy threshold is classified as TYPE_2.
5. **Keyword Mismatch (Type 2, semantic).** We compute a 384-dim sentence
   embedding of your query (locally, via \`all-MiniLM-L6-v2\` — no external
   API) and compare it against product embeddings in Postgres (pgvector
   cosine similarity). Top match above 0.72 → TYPE_2.
6. **Product Gap (Type 1).** Nothing matched closely enough. Confidence
   increases as the closest match gets further away.
7. **Low-volume flag.** Anything asked fewer than 5 times in 30 days is
   still classified but hidden from the free-tier dashboard.

Thresholds are environment-configurable so we can tune per-industry
benchmarks without a deploy.

## Revenue formula

For each classified gap we compute:

\`\`\`
estimate = monthly_volume × average_order_value × category_benchmark
band     = estimate × (1 ± 20%)
\`\`\`

**Worked example** (PRD §10.3): a fashion merchant sees "bandhgala" searched
200 times a month, with a $42 AOV. Fashion's conversion benchmark is 10%:

\`\`\`
200 × $42 × 10% = $840/month
band: $672 – $1,008
\`\`\`

The ±20% band reflects the uncertainty stacking from three independent
estimates: the Shopify analytics sampling, the volume-to-intent mapping, and
the category benchmark.

## Category benchmarks

Benchmarks are conversion-rate medians across industry reports (Baymard, Nosto,
Shopify Commerce Trends):

| Category | Benchmark |
|---|---|
| Fashion | 10% |
| Beauty | 12% |
| Electronics | 7.5% |
| Home | 9% |
| Food & Grocery | 14% |
| Other | 8% (default) |

Your store's category is detected from \`shop.industry\` first, then from the
majority of your top-3 product tags, then falls back to the default.

## What we don't store

We never store customer personal data. Not names. Not emails. Not addresses.
Not cart contents. Not session IDs. The only identity we keep is the shop
domain and the merchant's contact email. Our Shopify GDPR \`customers/redact\`
handler is a no-op because there is nothing for us to redact.

## Questions?

Email us at ${env.SUPPORT_EMAIL}.
`;

export default function MethodologyPage(): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '48px auto',
        padding: '24px',
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        color: '#202223',
        lineHeight: 1.55,
      }}
    >
      <article className="prose">
        <ReactMarkdown>{METHODOLOGY_MD}</ReactMarkdown>
      </article>
    </main>
  );
}
