import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Waiting for an app that paints slowly.
 *
 * Measured against the EC2 test environment: a navigation returns 200 in about
 * 5s and then takes another ~15s before anything is interactive, and the
 * sidebar does the same after every route change. Leaning on `actionTimeout`
 * to absorb that works until it doesn't, and when it fails the error points at
 * whatever element was clicked rather than at "the view never rendered".
 *
 * These helpers wait on a named signal instead, so a slow paint is waited out
 * and a genuinely broken view fails with a message that says which view.
 */

/** Budget for one view to become interactive after a navigation. */
export const FIRST_PAINT_TIMEOUT = 60_000;

/** The sidebar, which is the last thing to arrive on a cold route change. */
export function appShell(page: Page): Locator {
  return page.getByRole('menuitem').first();
}

/** Waits for the sidebar, i.e. for the app to be navigable. */
export async function waitForAppShell(page: Page, timeout = FIRST_PAINT_TIMEOUT): Promise<void> {
  await expect(appShell(page), 'App shell (sidebar) never rendered').toBeVisible({ timeout });
}

/**
 * Navigates and waits for the view's own anchor element.
 *
 * Reloads once if nothing paints. That is not a blind retry to paper over a
 * flaky test: this app intermittently serves a shell that never hydrates - an
 * empty iframe on /dashboard being the reproducible case - and a reload
 * recovers it. The reload is capped at one and the failure message says it
 * happened, so a view that is actually broken still fails and says so.
 */
export async function gotoAndWait(
  page: Page,
  url: string,
  anchor: Locator,
  { timeout = FIRST_PAINT_TIMEOUT, description = url }: { timeout?: number; description?: string } = {},
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(url);
    try {
      await expect(anchor).toBeVisible({ timeout });
      return;
    } catch {
      if (attempt === 1) {
        throw new Error(
          `${description} did not become interactive within ${timeout / 1000}s, ` +
            'across an initial load and one reload.',
        );
      }
    }
  }
}

/**
 * Waits for a locator that may take a first paint to appear, returning whether
 * it did rather than throwing.
 *
 * For genuinely optional UI - a confirmation dialog that only some orders
 * trigger. A strict-mode violation still throws, because an ambiguous locator
 * is a problem to surface, not to treat as "absent".
 */
export async function appearsWithin(target: Locator, timeout: number): Promise<boolean> {
  try {
    await expect(target).toBeVisible({ timeout });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('strict mode violation')) {
      throw error;
    }
    return false;
  }
}
