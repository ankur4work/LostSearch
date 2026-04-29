import ReactMarkdown from 'react-markdown';
import { env } from '@/lib/env';

export const metadata = {
  title: 'Privacy Policy · LostSearch',
  description: 'What we collect, why we collect it, and how long we keep it.',
  robots: { index: true, follow: true },
};

const PRIVACY_MD = `
# Privacy Policy

_Last updated: 22 April 2026_

LostSearch (the "Service") is a Shopify app that analyses search
queries shoppers type into your storefront and shows you the product gaps +
revenue those queries represent. This policy explains what we collect, why,
and for how long.

## What we store

| Data | Source | Purpose | Retention |
|---|---|---|---|
| Shop domain (\`foo.myshopify.com\`) | OAuth install | Identify the merchant account | Life of install + 30 days |
| Merchant email | Shopify \`shop\` query | Digest delivery + support | Life of install + 30 days |
| Shopify offline access token | OAuth exchange | Call Shopify APIs on your behalf | AES-256-GCM encrypted; deleted on uninstall |
| Product catalog metadata | Shopify Admin API | Match shopper queries to products | Refreshed every 24h; deleted on uninstall |
| Search query strings + counts | Shopify Search & Discovery analytics | Classify + rank the gaps | 30-day rolling window |
| Order aggregates (count, total) | Shopify Admin API | Compute AOV for revenue estimates | 90 days; no individual order details retained |
| Classifications + revenue estimates | Computed by us | Power the dashboard | Life of install + 30 days |

## What we do NOT store

- **Customer PII.** No names, no emails, no addresses, no phone numbers, no
  cart contents, no session IDs. Ever.
- **Payment data.** All billing is handled by Shopify; we never see credit
  card information.
- **Free-text messages.** The app has no chat or comments — there's nothing
  to log.

## How long we keep it

- **Active stores.** Retained for the life of the install.
- **Uninstall.** 30-day grace window. If you reinstall within the window, all
  prior data is restored.
- **Shopify \`shop/redact\` webhook.** Triggers a 48h-delayed hard delete.
  Reinstall during that window cancels the delete automatically.
- **Backups.** Nightly encrypted snapshots, retained 30 days. Deletion
  propagates through the next restore cycle.

## Who we share with

We use the following sub-processors. Each has signed a DPA with us:

- **Shopify** (hosted data): the store, product, and order data the Service
  reads from Shopify remains governed by Shopify's own privacy terms.
- **Coolify (our VPS)**: runs the application servers.
- **Resend** (email delivery): sends weekly digests. They see the merchant
  email address, the digest HTML, and basic delivery metadata.
- **PostHog** (product analytics, optional): we send anonymized event
  telemetry keyed on the opaque store ID — never the merchant email.
- **Sentry** (error tracking): exception traces. We scrub access tokens and
  authorization headers before sending.

## Your rights

- **Access / export**: in-app, Settings → Privacy → Export my data. Delivered
  instantly as JSON.
- **Deletion**: uninstall the app. Data is deleted 30 days later, or
  immediately if Shopify's \`shop/redact\` webhook fires.
- **Portability**: the export JSON is a complete copy of everything we hold.
- **Data Processing Addendum**: available on request${env.DPA_URL ? ` (signed template at ${env.DPA_URL})` : ''}.

## Contact

Email ${env.PRIVACY_CONTACT_EMAIL} for any privacy request. We respond within
30 days as required by GDPR.

## Cookies

The embedded app uses session tokens only — no first-party cookies are set by
the app inside Shopify Admin. The public marketing site (methodology, this
page, unsubscribe) sets no cookies.

## Changes to this policy

Material changes will be notified via in-app banner and email at least 30
days before taking effect. Prior versions archived in the project git
history.
`;

export default function PrivacyPage(): JSX.Element {
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
        <ReactMarkdown>{PRIVACY_MD}</ReactMarkdown>
      </article>
    </main>
  );
}
