import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Local runs read secrets from .env; CI is expected to inject them as real
// environment variables, so an absent .env is not an error.
dotenv.config({ path: path.resolve(rootDir, '.env') });

const isCI = !!process.env.CI;

/**
 * Session cookies/localStorage captured once by the `setup` project and reused
 * by every test, so the login UI is exercised once instead of per test.
 * Lives under playwright/.auth/, which is gitignored.
 */
export const STORAGE_STATE = path.resolve(rootDir, 'playwright/.auth/user.json');

export default defineConfig({
  testDir: './tests',

  fullyParallel: true,

  // Fail the CI build if someone left a test.only behind.
  forbidOnly: isCI,

  // One retry in CI to absorb infrastructure flake; none locally, where a
  // flaky test should be visible immediately rather than papered over.
  retries: isCI ? 1 : 0,

  workers: isCI ? 2 : undefined,

  reporter: isCI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL,

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  expect: {
    timeout: 10_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],
});
