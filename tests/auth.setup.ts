import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { STORAGE_STATE } from '../playwright.config';

/**
 * Logs in through the real UI once per run and saves the resulting session to
 * STORAGE_STATE. Every other project loads that file instead of logging in,
 * so the login form is covered once and the rest of the suite starts
 * authenticated.
 *
 * STATUS: stub. The selectors below are placeholders - replace them after
 * running `npm run codegen -- <BASE_URL>` against the real login page.
 */
setup('authenticate', async ({ page, baseURL }) => {
  const username = process.env.TB_USER;
  const password = process.env.TB_PASS;

  // Fail loudly and early: a missing credential otherwise surfaces as a
  // confusing "expected string, got undefined" deep inside fill().
  if (!baseURL) {
    throw new Error('BASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  if (!username || !password) {
    throw new Error('TB_USER and/or TB_PASS are not set. Copy .env.example to .env and fill them in.');
  }

  // TODO: confirm the real login path (may be '/', '/login', '/sign_in', ...).
  await page.goto('/login');

  // TODO: replace with real locators from codegen. Prefer user-facing
  // locators (getByLabel / getByRole) over CSS so they survive restyling.
  await page.getByLabel(/email|username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // TODO: replace with a real post-login signal - a URL the app only reaches
  // when authenticated, or an element only rendered for a signed-in user.
  // Waiting on a concrete signal (not networkidle) is what keeps this stable.
  await expect(page).toHaveURL(/dashboard|orders|home/i);
  // await expect(page.getByRole('button', { name: /account|profile/i })).toBeVisible();

  // TODO: if the app shows a first-run modal, tour, or cookie banner, dismiss
  // it here so its state is baked into storageState and no test has to.

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
