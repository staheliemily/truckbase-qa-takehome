---
name: codegen-to-suite
description: Turn raw Playwright codegen output into a structured, maintainable test suite with page objects, role-based locators, and business assertions. Use whenever the user has recorded a flow with `playwright codegen` and wants real test files out of it, or pastes linear generated Playwright code and asks to clean it up, refactor it, add page objects, or make it CI-ready. Trigger on phrases like "here's my codegen output", "refactor this Playwright recording", "turn this into a real test", or when a user shares a long linear `.spec.ts` full of raw CSS/XPath selectors.
---

# Codegen to Suite

Codegen output is a selector transcript. Keep the selectors, discard the shape.

## Hard rules

**Never invent a selector.** If the recording lacks a locator the test needs, say so and ask.

**Never leave credentials in code.** Literals move to `process.env`, placeholders to `.env.example`.

**Never automate destructive actions** — deletes, bulk operations, anything that emails a real person — unless explicitly asked. Flag them if present in the recording.

## Locators

Priority: `getByRole` with accessible name → `getByLabel` → `getByText` → `getByTestId` → CSS last resort.

Discard auto-generated IDs (`#mui-4821`, `:r3h:`) — they change per render. Where a conversion is uncertain, keep the original as a one-line comment.

Scope by chaining, not long CSS paths:

```ts
const row = page.getByRole('row').filter({ hasText: reference });
await expect(row.getByRole('cell', { name: /^\$/ })).toHaveText('$1,234.56');
```

## Waits

Delete every `waitForTimeout`. Locators auto-wait; `expect()` retries. A sleep means the condition it waited for should become an assertion.

Avoid `waitForSelector`, `waitForLoadState('networkidle')`, and manual polling.

## Assertions

Codegen produces visibility checks or nothing. Replace with business rules: a total equals a sum, a status advanced, a record exists.

Always `await expect(...)`, never `expect(await ...)` — the latter loses auto-retry.

Assert on locators, not extracted strings:

```ts
await expect(total).toHaveText('$1,234.56');         // retries
expect(await total.textContent()).toBe('$1,234.56'); // does not
```

`toHaveText` for exact, `toContainText` for partial, `toHaveCount` over array length.

## Structure

Scale to the recording. One form does not need four page objects.

```
tests/
  <flow>.spec.ts
  auth.setup.ts
  pages/<Page>.ts
  helpers/testData.ts
playwright.config.ts
.env.example
```

Page objects hold locators and intent methods. Assertions live in the test.

```ts
export class OrderForm {
  readonly page: Page;
  readonly rate: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rate = page.getByLabel('Linehaul rate');
    this.submit = page.getByRole('button', { name: 'Create order' });
  }

  async create(opts: { customer: string; rate: string; reference: string }) {
    await this.page.getByLabel('Customer').fill(opts.customer);
    await this.rate.fill(opts.rate);
    await this.submit.click();
  }
}
```

Assign locators in the constructor body, not as field initializers. Field initializers run before the constructor assigns `this.page`, so `readonly rate = this.page.getByLabel(...)` fails to compile under `target: ES2022` and throws at runtime everywhere else.

## Auth

Login goes in a setup project saving `storageState`, wired as a project dependency:

```ts
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
    dependencies: ['setup'],
  },
]
```

API login via `request.post()` is faster where available; note that it skips exercising the login UI.

## Test independence

Each test creates its own data with a unique reference — prefix plus timestamp or UUID. No dependence on records from previous runs, no shared mutable state, no ordering assumptions.

Playwright isolates browser context per test, not backend state. Data collisions are the usual source of parallel-run flake.

## Config

```ts
use: {
  baseURL: process.env.BASE_URL,
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
},
fullyParallel: true,
retries: process.env.CI ? 1 : 0,
forbidOnly: !!process.env.CI,
```

## Comparing values

Normalize anything formatted before comparing:

```ts
export const money = (s: string) => s.replace(/[$,\s]/g, '');
```

Reading one value from several views: fail with a message naming which view disagreed.

## Comments

Explain only what the code cannot: why a selector is positional, what the recording did not prove, which expected value is a guess. One line, directly above the thing it qualifies.

Skip everything else — no restating the call below, no section banners, no file-header essays. A file whose comments outnumber its statements is harder to review than the code alone.

## Report back

After generating, state:

1. Selectors that could not be derived, and what's needed
2. Conversions made with low confidence
3. Assertions added and the rule each covers
4. What was deliberately not automated

Then delete the raw codegen file.

## Avoid

- Building a framework for a small flow
- Retries to mask flakiness
- `test.describe` wrapping a single test
- Tests for flows the recording doesn't cover
