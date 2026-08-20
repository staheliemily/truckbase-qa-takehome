# Truckbase QA Take-Home

Lead QA exercise covering the order creation → Truckbase invoicing workflow.
The written analysis is the primary deliverable: the risk ranking, the findings,
and the release call. The automated test covers a single scenario — the assigned
workflow end to end — chosen to protect the highest-ranked risk rather than to
demonstrate breadth.

## Documentation

| Document | Part |
| --- | --- |
| [Test approach](docs/test-approach.md) — risk list, ranking rationale, scenarios chosen and skipped | Part 1 |
| [Findings](docs/findings-report.html) — three findings with repro steps, impact, and screenshots | Part 2 |
| [Release recommendation](docs/release-recommendation.html) — ship/hold call, conditions, what to test next | Part 4 |
| [AI usage](docs/ai-usage.md) — tools used, what was changed or rejected | — |
| [Additional observations](docs/findings.md) — further notes from the automation, outside the three submitted findings | — |

The findings and the release recommendation are self-contained HTML: they open in
a browser with no build step, and the findings carry their own screenshots.

## Setup

Requires Node 20 or newer.

```bash
npm install
npx playwright install chromium   # already run by postinstall; repeat if the browser is missing
cp .env.example .env
```

Fill in `.env`:

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | Base URL of the app under test, no trailing slash |
| `TB_USER` | Login email for the test account |
| `TB_PASS` | Password for the test account |

`.env` is gitignored and never committed — only `.env.example`, with
placeholders. In CI, supply the same three as environment variables or secrets;
an absent `.env` is not an error.

If any is missing the run stops immediately and names the ones it could not find.

## Running the test

```bash
npm test              # full suite, headless, chromium
npm run test:headed   # watch it drive the browser
npm run test:ui       # Playwright UI mode
npm run test:debug    # step through with the inspector
npm run typecheck     # tsc --noEmit
```

One test case at a time:

```bash
npx playwright test tests/order-creation.spec.ts     # TC-01
npx playwright test tests/order-to-invoice.spec.ts   # TC-02
```

The HTML report from the last run:

```bash
npm run report
```

It opens `playwright-report/`, with trace, screenshot, and video attached to any
failure. Both are gitignored.

Each test creates its own order, so a full run leaves two new orders in the
environment. Nothing is deleted — there is no destructive teardown.

## Scenario selection

The automated scenario is the assigned workflow end to end: create an order with
a known rate, invoice it, and read the result back.

Its primary assertion — **invoice amount equals order rate** — covers risk 1,
the highest-ranked risk in the test approach. That ranking was deliberate:
billing the wrong amount is both the largest money impact and the quietest
failure, the kind caught at reconciliation weeks later, if ever. If only one
assertion could run, it would be that one.

The remaining assertions cover cross-view consistency, which the brief's own tips
point at twice. They are cheap to add once the scenario is running and they catch
the class of defect where each individual view looks correct and the records
disagree with one another.

The scenario is implemented as two test cases so a failure localizes: TC-01
proves an order stores the rate it was given, TC-02 proves that rate survives
invoicing. When TC-02 fails alone, order creation is not the cause.

## Risks covered

Mapped to the numbered risks in [docs/test-approach.md](docs/test-approach.md).

| Assertion | Risk |
| --- | --- |
| Invoice amount equals the rate stored on the order | **1** — Wrong amount billed |
| Exactly one invoice exists for the order | **2** — Duplicate invoice |
| The order's invoice status reads `Invoice Created` | **3** — Invoice exists but the order doesn't know it |
| The invoice carries this run's customer reference, not just a matching id | **4** — Order and invoice quietly diverge |
| The rate reads the same in the orders list and on the invoice | **5** — Views disagree |
| The order stores the rate as entered (TC-01) | **6** — Can't bill at all |
| Exactly one order appears in the list after creation (TC-01) | **10** — Order doesn't appear in the list |

Risks 7, 8, and 9 are not covered by automation. 7 (incomplete order can be
invoiced) is the subject of the next test below; 8 (preview doesn't match what's
saved) and 9 (order data saves wrong) received exploratory coverage only.

## What I would automate next

Two tests, both of which fail today. That is the point of writing them — each one
pins a known defect so a fix is provable and a regression is loud.

1. **Negative-rate regression**, guarding *"No validation on the linehaul rate;
   negative values generate a billable invoice"* (finding 01 in the findings
   report). Enter a negative linehaul rate and assert the order cannot be saved,
   or that invoicing it is blocked. Currently the order saves and produces a
   billable invoice for a negative amount. This also closes risk 7.

2. **Invoice send**, guarding *"Invoice cannot be viewed from the invoices list,
   or sent to the customer"* (finding 02 in the findings report). Assert that
   `POST /api/v3/invoices/{id}/send` returns 200. Driving it at the API level
   keeps the check off the UI, which is the layer currently failing, and makes it
   clear whether the defect is in delivery or in the interface to it.

Both belong in the suite before either fix ships, failing, so the fix is what
turns them green.

## CI/CD considerations

What would need to change before this runs in a pipeline:

- **Secrets from CI variables.** `BASE_URL`, `TB_USER`, and `TB_PASS` come from
  the environment already, so this is configuration rather than code. Nothing
  credential-bearing is committed, and it must stay that way.
- **Test data isolation.** Every record the suite creates carries a timestamped
  reference so parallel runs and repeated runs cannot collide. Shared seed data —
  the customer, driver, and truck — is read but not modified.
- **No destructive teardown against shared environments.** The suite deletes
  nothing. Cleanup against an environment other people are using is more
  dangerous than the clutter it removes.
- **Stable test IDs from the application.** The rate field and the status chips
  are currently reached through generated class names and positional selectors.
  A `data-testid` on each would remove the most brittle locators in the suite.
- **Artifacts on failure.** Trace, screenshot, and video are already configured
  and should be uploaded by the pipeline. Note that traces record values passed
  to `fill()`, including the password — restrict who can download them.
- **Never against production.** This suite creates real orders and real invoices.
  It belongs on a dedicated test environment, gated so it cannot be pointed at
  production by configuration alone.

## Environment notes

The application was served as a Vite dev build and was slow throughout. First
interactive paint measured roughly 20 seconds against a 5-second HTTP response,
and the same delay followed every route change. The suite's timeouts are sized
for that — 45s per action, 300s per test — and would be far too generous against
a production build.

The environment was also intermittently unable to render a signed-in view at all.
A full-suite run failed at login and passed on an immediate retry with no code
change.

Verified in a full run: both test cases pass end to end, including invoice
creation and every assertion listed above.

Not verified: invoice download and invoice send, both of which fail for the
reasons recorded in the findings. Coverage for the download is written but
deliberately not wired into any test while the defect is open.
