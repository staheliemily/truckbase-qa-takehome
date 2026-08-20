# truckbase-qa-takehome

Playwright + TypeScript automation for the order creation → invoicing workflow. Lead QA take-home exercise.

## Setup

Requires Node 20+.

```bash
npm install          # installs deps and the chromium binary
cp .env.example .env # then fill in real values
```

`.env` holds:

| Variable   | Purpose                                        |
| ---------- | ---------------------------------------------- |
| `BASE_URL` | Base URL of the app under test, no trailing slash |
| `TB_USER`  | Login email for the test account                |
| `TB_PASS`  | Password for the test account                   |

`.env` is gitignored and never committed — only `.env.example`, with placeholders.

## Running the tests

```bash
npm test              # full suite, headless, chromium
npm run test:headed   # watch it drive the browser
npm run test:ui       # Playwright UI mode, best for developing a test
npm run test:debug    # step through with the inspector
npm run report        # open the HTML report from the last run
npm run typecheck     # tsc --noEmit
```

Useful narrowing while iterating:

```bash
npx playwright test tests/some.spec.ts        # one file
npx playwright test -g "creates an invoice"   # by title
npm run codegen -- $BASE_URL                  # record selectors against the app
```

A `setup` project logs in through the UI once and writes the session to
`playwright/.auth/user.json`; the `chromium` project depends on it and starts
authenticated. Delete that file to force a fresh login.

Artifacts on failure: trace on first retry, screenshot, and video — all under
`test-results/`, linked from the HTML report.

## Project structure

```
playwright.config.ts     projects, artifacts, env wiring
tests/
  auth.setup.ts          UI login → storageState
  helpers/
    consistency.ts       compare one record across views, name the view that disagreed
    testData.ts          EM- prefixed unique ids for records the suite creates
```

## Scenario rationale

_TBD — which flows are covered, what each one is protecting against, and what
was deliberately left out._

## CI considerations

_TBD._

## AI usage

_TBD._
