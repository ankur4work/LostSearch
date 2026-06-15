import { env } from '@/lib/env';

export const metadata = {
  title: 'Methodology · DemandRadar',
  description:
    'How DemandRadar classifies failed Shopify storefront searches and estimates the revenue impact for each gap.',
  robots: { index: true, follow: true },
  alternates: { canonical: `${process.env.SHOPIFY_APP_URL ?? ''}/methodology` },
};

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 880,
  margin: '48px auto',
  padding: '0 24px 80px',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  color: '#1a1a1a',
  lineHeight: 1.65,
};

const HERO_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
  color: '#fff',
  borderRadius: 16,
  padding: '36px 40px',
  marginBottom: 32,
  boxShadow: '0 8px 24px rgba(79, 70, 229, 0.18)',
};

const CARD_STYLE: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e1e3e5',
  borderRadius: 12,
  padding: '28px 32px',
  marginBottom: 20,
  boxShadow: '0 1px 0 rgba(0,0,0,0.03)',
};

const H2_STYLE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
  marginBottom: 16,
  color: '#1a1a1a',
};

const H3_STYLE: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: 0,
  marginBottom: 6,
  color: '#1a1a1a',
};

const PARA_STYLE: React.CSSProperties = {
  fontSize: 15,
  margin: 0,
  marginBottom: 12,
  color: '#3a3f44',
};

const CALLOUT_STYLE: React.CSSProperties = {
  background: '#f6f8fa',
  border: '1px solid #e1e3e5',
  borderRadius: 8,
  padding: '14px 18px',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: 13,
  color: '#3a3f44',
  whiteSpace: 'pre-wrap',
  margin: '8px 0 16px',
};

interface GapType {
  name: string;
  short: string;
  description: string;
  fix: string;
  color: string;
}

const GAP_TYPES: GapType[] = [
  {
    name: 'Missing products',
    short: 'TYPE 1',
    description:
      'Shoppers searched for something your store does not carry. The query returned nothing or only weak / unrelated matches. These are the highest-leverage gaps because each one is direct buying intent that hit a wall.',
    fix: 'Add the product (or a category page that catches the search). One new SKU can recover dozens of failed searches per month.',
    color: '#dc2626',
  },
  {
    name: 'Wrong matches',
    short: 'TYPE 2',
    description:
      'Results showed up but nobody clicked. Usually because the search engine surfaced products that were not what the shopper meant — synonyms, plurals, or near-spellings broke the match.',
    fix: 'Add a synonym in Shopify Search & Discovery so the relevant product ranks first the next time someone searches that term.',
    color: '#ea580c',
  },
  {
    name: 'Low-interest results',
    short: 'TYPE 3',
    description:
      'Search returned products and a few people clicked, but conversion is poor — long-tail or niche queries where intent is real but small.',
    fix: 'Track whether volume grows. If a niche query trends up, consider broadening copy or featuring a hero variant on the relevant product.',
    color: '#ca8a04',
  },
  {
    name: 'Healthy searches',
    short: 'TYPE 4',
    description:
      'Search worked: results showed, shoppers clicked. No action needed.',
    fix: 'Nothing to do. We surface this for transparency so you can see the share of your search traffic that is healthy.',
    color: '#16a34a',
  },
];

interface BenchmarkRow {
  category: string;
  rate: string;
}

const BENCHMARKS: BenchmarkRow[] = [
  { category: 'Fashion & Apparel', rate: '10%' },
  { category: 'Beauty & Personal Care', rate: '12%' },
  { category: 'Electronics', rate: '7.5%' },
  { category: 'Home & Garden', rate: '9%' },
  { category: 'Food & Grocery', rate: '14%' },
  { category: 'Other / default', rate: '8%' },
];

export default function MethodologyPage(): JSX.Element {
  return (
    <main style={PAGE_STYLE}>
      {/* HERO */}
      <div style={HERO_STYLE}>
        <div
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.16)',
            marginBottom: 14,
          }}
        >
          METHODOLOGY
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0, marginBottom: 10, lineHeight: 1.15 }}>
          How DemandRadar classifies gaps and estimates revenue.
        </h1>
        <p style={{ fontSize: 16, opacity: 0.94, margin: 0, maxWidth: 640 }}>
          Every shopper search on your storefront tells you something. DemandRadar listens, sorts
          each search into a clear category, and turns the failed ones into a ranked list of
          revenue you can recover. This page explains exactly how.
        </p>
      </div>

      {/* OVERVIEW */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>What we look at</h2>
        <p style={PARA_STYLE}>
          For each store we connect to, we read three things from Shopify:
        </p>
        <ul style={{ ...PARA_STYLE, paddingLeft: 22 }}>
          <li>
            <strong>Your product catalog</strong> — titles, descriptions, tags, vendors. So we
            know what shoppers <em>could</em> have found.
          </li>
          <li>
            <strong>Aggregate order totals (last 90 days)</strong> — used only to compute your
            average order value (AOV). We do not store individual order line items, customer
            names, emails, or addresses.
          </li>
          <li>
            <strong>Storefront search events</strong> — the query text a shopper typed, how many
            results came back, and whether they clicked one. Captured by a small storefront
            tracker installed automatically when you add DemandRadar.
          </li>
        </ul>
        <p style={PARA_STYLE}>
          We then evaluate every search query from the last 30 days against your catalog and
          assign it to one of four categories described below.
        </p>
      </section>

      {/* GAP TYPES */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>The four search outcomes</h2>
        <p style={PARA_STYLE}>
          Each query falls into exactly one bucket. The first three are gaps you can act on; the
          fourth is healthy traffic shown for context.
        </p>
        <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
          {GAP_TYPES.map((g) => (
            <div
              key={g.short}
              style={{
                border: '1px solid #e1e3e5',
                borderLeft: `4px solid ${g.color}`,
                borderRadius: 10,
                padding: '18px 22px',
                background: '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <h3 style={{ ...H3_STYLE, marginBottom: 0 }}>{g.name}</h3>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    color: g.color,
                    border: `1px solid ${g.color}`,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {g.short}
                </span>
              </div>
              <p style={{ ...PARA_STYLE, marginBottom: 8 }}>{g.description}</p>
              <p style={{ ...PARA_STYLE, marginBottom: 0, fontStyle: 'italic', color: '#5a6168' }}>
                <strong style={{ fontStyle: 'normal', color: '#1a1a1a' }}>How to fix:</strong>{' '}
                {g.fix}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CLASSIFICATION LOGIC */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>How classification works</h2>
        <p style={PARA_STYLE}>
          Every query is evaluated by a deterministic decision process — same input always
          produces the same classification. The first rule that matches wins.
        </p>
        <ol style={{ ...PARA_STYLE, paddingLeft: 22 }}>
          <li>
            <strong>Healthy search check.</strong> If the query returned results AND someone
            clicked, it is classified as <em>Healthy</em> and skipped.
          </li>
          <li>
            <strong>Zero results check.</strong> If the query returned no products at all, it is
            a <em>Missing product</em> gap.
          </li>
          <li>
            <strong>Exact match check.</strong> If the query appears word-for-word in any
            product title or tag, results were fine — classified as healthy.
          </li>
          <li>
            <strong>Fuzzy match against catalog.</strong> We compare the query to every product
            title, tag, and vendor using approximate string matching (handles typos, plurals,
            close spellings). If a strong fuzzy match exists but shoppers did not click, the
            query is a <em>Wrong match</em> gap.
          </li>
          <li>
            <strong>Semantic match against catalog.</strong> If fuzzy matching is inconclusive,
            we compare the meaning of the query to your product descriptions. A query whose
            meaning is close to a product but did not click through is a <em>Wrong match</em>{' '}
            gap.
          </li>
          <li>
            <strong>Tail check.</strong> Anything asked fewer than 5 times in the last 30 days
            is still recorded but hidden from the dashboard until it accumulates enough volume
            to trust.
          </li>
        </ol>
        <p style={{ ...PARA_STYLE, marginTop: 12, fontSize: 13, color: '#6d7175' }}>
          All semantic comparisons run inside our own infrastructure — query text is never sent
          to any third-party AI provider.
        </p>
      </section>

      {/* REVENUE FORMULA */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>How we estimate revenue</h2>
        <p style={PARA_STYLE}>
          For every gap, we compute an estimated monthly revenue impact using three inputs we
          already know about your store.
        </p>
        <div style={CALLOUT_STYLE}>
          {`monthly_revenue = monthly_search_volume
                  × your_average_order_value
                  × category_benchmark_conversion_rate

range = monthly_revenue × (1 ± 20%)`}
        </div>
        <h3 style={H3_STYLE}>Example</h3>
        <p style={PARA_STYLE}>
          A fashion store with a $42 AOV sees the query <em>&ldquo;winter coat&rdquo;</em>{' '}
          searched 200 times in 30 days, but no matching products exist. Fashion&rsquo;s
          benchmark conversion rate is 10%.
        </p>
        <div style={CALLOUT_STYLE}>
          {`200 searches × $42 AOV × 10% benchmark = $840 / month
estimated range: $672 – $1,008`}
        </div>
        <p style={PARA_STYLE}>
          We show the range (not just the point estimate) because every input has uncertainty —
          search volume is sampled, conversion benchmarks vary by sub-segment, and AOV moves
          with discounts. The range is calibrated so the true value falls inside it most of the
          time.
        </p>
      </section>

      {/* BENCHMARKS */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>Category benchmarks</h2>
        <p style={PARA_STYLE}>
          Conversion rates differ a lot by category. We use medians from public Shopify Commerce
          Trends data and independent retail analytics reports.
        </p>
        <div
          style={{
            border: '1px solid #e1e3e5',
            borderRadius: 8,
            overflow: 'hidden',
            marginTop: 8,
          }}
        >
          {BENCHMARKS.map((b, i) => (
            <div
              key={b.category}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: i % 2 === 0 ? '#fff' : '#fafbfb',
                fontSize: 14,
                color: '#3a3f44',
              }}
            >
              <span>{b.category}</span>
              <strong style={{ color: '#1a1a1a' }}>{b.rate}</strong>
            </div>
          ))}
        </div>
        <p style={{ ...PARA_STYLE, marginTop: 12, fontSize: 13, color: '#6d7175' }}>
          Your store&rsquo;s category is detected automatically from your Shopify shop industry
          and product tags. It can be overridden in the app settings.
        </p>
      </section>

      {/* DATA & PRIVACY */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>Data &amp; privacy</h2>
        <h3 style={H3_STYLE}>What we store</h3>
        <ul style={{ ...PARA_STYLE, paddingLeft: 22 }}>
          <li>Your shop domain, billing plan, and the merchant contact email.</li>
          <li>Your product catalog (titles, descriptions, tags) for matching searches against.</li>
          <li>The aggregate AOV computed from your order totals.</li>
          <li>The text of storefront search queries, with their result counts and click counts.</li>
        </ul>
        <h3 style={{ ...H3_STYLE, marginTop: 14 }}>What we do not store</h3>
        <ul style={{ ...PARA_STYLE, paddingLeft: 22 }}>
          <li>Customer names, emails, phone numbers, or addresses.</li>
          <li>Cart contents or individual purchase line items.</li>
          <li>Session IDs, IP addresses, or device fingerprints.</li>
          <li>Payment information of any kind.</li>
        </ul>
        <h3 style={{ ...H3_STYLE, marginTop: 14 }}>GDPR compliance</h3>
        <p style={PARA_STYLE}>
          We register Shopify&rsquo;s mandatory compliance webhooks
          (<code>customers/data_request</code>, <code>customers/redact</code>,{' '}
          <code>shop/redact</code>). When a redaction request arrives we verify and respond
          within 30 days. Because we do not store customer-identifiable data, the redaction
          handler typically has nothing to delete — but the endpoint is wired up and audited.
        </p>
        <p style={PARA_STYLE}>
          On uninstall, your shop&rsquo;s data is retained for 30 days for billing and recovery
          purposes, then permanently deleted.
        </p>
      </section>

      {/* CONTACT */}
      <section style={CARD_STYLE}>
        <h2 style={H2_STYLE}>Questions?</h2>
        <p style={PARA_STYLE}>
          Email <a href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a>. We reply within
          one business day.
        </p>
      </section>
    </main>
  );
}
