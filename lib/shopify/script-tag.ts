import type { Store } from '@prisma/client';
import { env } from '../env';
import { logger } from '../logger';
import { ShopifyClient } from './client';

/**
 * Storefront search tracking is delivered two ways, by design:
 *
 *   1. Theme app embed block (`extensions/storefront-tracker`) — the modern,
 *      durable path. Merchant-controllable in the theme editor.
 *   2. ScriptTag (this file) — auto-injected at install so tracking works with
 *      ZERO merchant action. App embeds are OFF by default and Shopify cannot
 *      auto-enable them; without this, a freshly installed app captures nothing
 *      until the merchant manually toggles the embed. That gap is exactly what
 *      caused search data to never sync during App Review.
 *
 * Both load the same `/tracker.js`, which is idempotent on the client (it only
 * hooks search once per page), so running with both enabled is harmless.
 *
 * ScriptTag is on Shopify's long-term deprecation path but fully functional on
 * the current Admin API version; the `write_script_tags` scope is already
 * granted. When the embed becomes reliably auto-activatable we can drop this.
 */

const TRACKER_PATH = '/tracker.js';

function trackerSrc(): string {
  return new URL(TRACKER_PATH, env.SHOPIFY_APP_URL).toString();
}

interface ScriptTagsQuery {
  scriptTags: {
    edges: Array<{ node: { id: string; src: string } }>;
  };
}

interface ScriptTagCreate {
  scriptTagCreate: {
    scriptTag: { id: string; src: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

/**
 * Idempotently ensure our storefront tracker ScriptTag exists for this store.
 * Safe to call on every (re)install — it no-ops if a tag with our src is
 * already present. Never throws: a failure here must not block install.
 */
export async function ensureTrackerScriptTag(
  store: Pick<Store, 'shopDomain' | 'accessToken'>,
): Promise<{ created: boolean; id?: string }> {
  const src = trackerSrc();
  const client = new ShopifyClient(store);

  try {
    const existing = await client.graphql<ScriptTagsQuery>(
      `query trackerScriptTags { scriptTags(first: 100) { edges { node { id src } } } }`,
    );
    const match = existing.data?.scriptTags.edges.find((e) => e.node.src === src);
    if (match) {
      logger.debug({ shop: store.shopDomain, id: match.node.id }, 'Tracker ScriptTag already present');
      return { created: false, id: match.node.id };
    }

    const res = await client.graphql<ScriptTagCreate>(
      `mutation createTrackerScriptTag($input: ScriptTagInput!) {
        scriptTagCreate(input: $input) {
          scriptTag { id src }
          userErrors { field message }
        }
      }`,
      { input: { src, displayScope: 'ONLINE_STORE', cache: true } },
    );

    const errors = res.data?.scriptTagCreate.userErrors ?? [];
    if (errors.length > 0) {
      logger.warn({ shop: store.shopDomain, errors }, 'scriptTagCreate returned userErrors');
      return { created: false };
    }

    const id = res.data?.scriptTagCreate.scriptTag?.id;
    logger.info({ shop: store.shopDomain, id, src }, 'Tracker ScriptTag created');
    return { created: true, id };
  } catch (err) {
    // Non-fatal: the theme app embed is still available as a fallback, and the
    // nightly install flow / next app open can retry.
    logger.warn(
      { shop: store.shopDomain, err: err instanceof Error ? err.message : String(err) },
      'Failed to ensure tracker ScriptTag — continuing without it',
    );
    return { created: false };
  }
}
