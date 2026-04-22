# FAQ

## Product

**Q1. What does "failed search" mean?**
A shopper typed something into your Shopify search that either returned zero
products, returned products but got no click, or returned products that the
shopper then filtered out. We find all three.

**Q2. How is the revenue estimate calculated?**
Monthly search volume × your store's actual AOV × a category-specific
conversion benchmark (Fashion 10%, Beauty 12%, Electronics 7.5%, Home 9%,
Food 14%, Default 8%). See [the methodology page](/methodology).

**Q3. Why are estimates shown as a range ($A – $B)?**
The ±20% band reflects uncertainty stacking from three independent sources:
Shopify's search sampling, our volume-to-intent mapping, and the category
benchmark median. We show the midpoint as the headline and the band as
context.

**Q4. Is the classification accurate?**
Every classification exposes a `reasoning` trail: which rule fired (exact
match, fuzzy, semantic, filter gap, etc.), which product matched, what the
similarity score was. Click any row to see it.

**Q5. Can I see a per-gap history?**
Yes — the detail modal shows a 30-day volume sparkline.

## Data

**Q6. What data do you collect?**
Shop domain, your merchant email, a Shopify offline access token (encrypted),
product catalog metadata (title/tags/description), search query strings +
counts, and aggregate order totals (for AOV). We never store customer PII.
Full list in our [privacy policy](/privacy).

**Q7. Is any of this shared with third parties?**
Email delivery (Resend), analytics (PostHog, opaque store-level only), error
tracking (Sentry, PII-scrubbed), and encrypted backups (Backblaze B2). That's
it. Full sub-processor list in the privacy policy.

**Q8. Is this GDPR-compliant?**
Yes. We implement Shopify's GDPR webhooks, offer one-click export via the
app, and delete all data 30 days after uninstall (or immediately on
`shop/redact`).

**Q9. Where do the AI embeddings run?**
Locally, on our own servers, using `all-MiniLM-L6-v2` via
`@xenova/transformers`. No OpenAI, no Anthropic, no Cohere. Your search data
never leaves our infrastructure for inference.

**Q10. Is this a "Built for Shopify" app?**
We target BFS compliance: embedded (App Bridge), Polaris UI, session tokens
(not cookies), sub-2s dashboard load, all GDPR webhooks implemented, billing
via Shopify Billing API. See `docs/BFS_CHECKLIST.md` for the full audit.

## Billing

**Q11. How does the free trial work?**
14 days on Growth, billed through Shopify. Cancel from your Shopify Admin at
any time — we don't make you email us.

**Q12. What happens if I cancel?**
You keep access until the end of the current billing period, then drop to
Free (top-5 gaps visible). All your data stays unless you uninstall.

**Q13. Is there an annual plan?**
Not yet. Coming post-1.0.

## Onboarding

**Q14. How fast until I see my first insight?**
Typical: 2–5 minutes after install. Longer if you have a very large catalog
(>10k products) because of the embedding step. We show a live progress bar.

**Q15. Why does the dashboard show "Come back in 7 days" sometimes?**
You need at least 50 search events in the last 30 days for the estimates to
be statistically meaningful. With fewer, any number we show would be noise,
so we pause instead.

## Technical

**Q16. What if Shopify's Search & Discovery app isn't installed?**
We detect this gracefully — ingestion runs, logs a warning, and the dashboard
displays a "no search data yet" empty state rather than failing.

**Q17. What Shopify scopes do you request?**
`read_products, read_content, read_themes, read_customers, read_orders`, plus
whatever Search & Discovery synonym writes require. No write scopes beyond
synonyms. Exact list shown on the Shopify install screen.

**Q18. Can I integrate with Slack?**
Planned for Pro tier. Vote in-app under Settings → Requests.
