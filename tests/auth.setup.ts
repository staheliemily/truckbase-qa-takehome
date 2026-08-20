import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { STORAGE_STATE } from '../playwright.config';
import { FIRST_PAINT_TIMEOUT, waitForAppShell } from './helpers/appReady';

/**
 * Logs in through the real UI once per run and saves the resulting session to
 * STORAGE_STATE. Every other project loads that file instead of logging in, so
 * the login form is covered once and the rest of the suite starts
 * authenticated.
 *
 * Every locator here comes from the codegen recording of the real sign-in page.
 */
setup('authenticate', async ({ page, baseURL }) => {
  // The default 30s per-test budget cannot cover two ~20s first paints.
  setup.setTimeout(180_000);

  const username = process.env.TB_USER;
  const password = process.env.TB_PASS;

  // Fail here rather than as "Invalid URL" in goto() or "expected string, got
  // undefined" inside fill(). This is the first thing the suite runs, so a
  // misconfigured environment stops the whole run with a message that says why.
  if (!baseURL || !username || !password) {
    const missing = [
      ['BASE_URL', baseURL],
      ['TB_USER', username],
      ['TB_PASS', password],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    throw new Error(
      `Missing required environment ${missing.length > 1 ? 'variables' : 'variable'}: ` +
        `${missing.join(', ')}. Copy .env.example to .env and fill it in, or set them ` +
        'in the environment (CI). See the README.',
    );
  }

  await page.goto('/signin');

  // The app returns 200 quickly but takes roughly 20s to render the sign-in
  // form, which is longer than the 15s actionTimeout. Wait on the field
  // itself rather than raising the global timeout, so every other action in
  // the suite keeps failing fast.
  const emailField = page.getByRole('textbox', { name: 'Email' });
  await expect(emailField).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  await emailField.fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for the sign-in to actually land before navigating. The recording
  // goes straight to /dashboard, but a hard navigation issued while the login
  // request is still in flight can abort it and leave the run on /signin with
  // no session to save.
  await expect(page).not.toHaveURL(/signin/i, { timeout: FIRST_PAINT_TIMEOUT });

  await page.goto('/dashboard');

  // Post-login signal: the sidebar, then the Orders entry within it. Matched
  // by hasText, not accessible name - the sidebar items are unlabelled icons
  // whose text labels are display:none, so
  // getByRole('menuitem', { name: 'Orders' }) finds nothing.
  await waitForAppShell(page);
  await expect(page.getByRole('menuitem').filter({ hasText: 'Orders' })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
