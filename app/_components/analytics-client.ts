'use client';

import posthog from 'posthog-js';

let initialized = false;

function ensureInit(): void {
  if (initialized || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    initialized = true;
    return;
  }
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: false,
    autocapture: false,
    person_profiles: 'identified_only',
  });
  initialized = true;
}

export const analytics = {
  identify(storeId: string, properties?: Record<string, string | number>): void {
    ensureInit();
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.identify(storeId, properties);
  },
  track(event: string, properties?: Record<string, string | number | boolean | null | undefined>): void {
    ensureInit();
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture(event, properties);
  },
};
