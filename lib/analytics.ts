import { PostHog } from 'posthog-node';
import { env } from './env';
import { logger } from './logger';

/**
 * Server-side analytics abstraction. When POSTHOG_KEY is unset we no-op but
 * still log the event at debug — handy for local dev and CI.
 *
 * Canonical event names (PRD §14):
 *   app_installed, onboarding_completed, synonym_added,
 *   billing_charge_activated, digest_sent, app_uninstalled,
 *   dashboard_viewed, gap_row_clicked, upgrade_cta_clicked
 */

export type AnalyticsEvent =
  | 'app_installed'
  | 'onboarding_completed'
  | 'synonym_added'
  | 'synonym_undone'
  | 'billing_charge_activated'
  | 'billing_charge_declined'
  | 'digest_sent'
  | 'digest_opened'
  | 'digest_unsubscribed'
  | 'app_uninstalled'
  | 'dashboard_viewed'
  | 'gap_row_clicked'
  | 'upgrade_cta_clicked';

interface TrackInput {
  event: AnalyticsEvent;
  distinctId: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!env.POSTHOG_KEY) return null;
  if (!client) {
    client = new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST, flushAt: 20, flushInterval: 10_000 });
  }
  return client;
}

export function track(input: TrackInput): void {
  const props = { ...input.properties, env: env.NODE_ENV };
  const c = getClient();
  if (c) {
    c.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: props,
    });
  }
  logger.debug({ analytics: true, event: input.event, distinctId: input.distinctId, props }, 'analytics.track');
}

export async function shutdownAnalytics(): Promise<void> {
  if (client) await client.shutdown();
}
