import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

afterEach(() => cleanup());

/** Wraps UI under Polaris AppProvider — required for any Polaris component. */
export function renderWithPolaris(ui: ReactElement, options?: RenderOptions) {
  return render(
    <AppProvider i18n={enTranslations}>{ui}</AppProvider>,
    options,
  );
}
