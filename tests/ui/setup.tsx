import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

// jsdom doesn't implement matchMedia, which Polaris's MediaQueryProvider calls
// on mount. Without this, every Polaris-rendering test throws
// "window.matchMedia is not a function". Standard no-op polyfill.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => cleanup());

/** Wraps UI under Polaris AppProvider — required for any Polaris component. */
export function renderWithPolaris(ui: ReactElement, options?: RenderOptions) {
  return render(
    <AppProvider i18n={enTranslations}>{ui}</AppProvider>,
    options,
  );
}
