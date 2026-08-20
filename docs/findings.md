# Findings — Order to Invoicing

Issues found while automating and exploring the order creation → invoicing
workflow. Seven findings, plus what was verified as working.

**Environment:** `http://ec2-100-24-21-166.compute-1.amazonaws.com` · Chromium ·
account `owner@truckbase.test` · August 2026

**Headline:** the money is right. An order's rate is preserved exactly through
invoicing, verified end to end. Every finding below is about the workflow
around that — reliability, feedback, and accessibility — not about the billing
arithmetic.

---

## Severity summary

| # | Finding | Severity |
|---|---|---|
| 1 | Invoice Service is required, but nothing says so | High |
| 2 | Sidebar navigation has no accessible names | High |
| 3 | Intermittent failure to render a signed-in view | High |
| 4 | ~20 seconds to first interactive paint | Medium |
| 5 | Rate cell concatenates two numbers | Medium |
| 6 | Third-party iframe loaded in the invoice view | Medium |
| 7 | Grid values absent from the DOM until scrolled | Low |

The invoice **download** failure is not listed separately: it is the same defect
as the exploratory report's finding 02 (invoice cannot be viewed or sent), and is
recorded there. The viewer chrome opens and its `download` control is reachable,
but no file is produced — the invoice document itself cannot be produced or
served.

---

## 1 — Invoice Service is required, but nothing says so

**Severity:** High · Confirmed, reproducible.

### Steps to reproduce
1. Open any order that has not been invoiced.
2. **Generate Documents** → **Invoice** → **Create**.
3. In the "Send invoice to …" dialog, leave the order line collapsed so the
   **Service** field is never set.
4. Click **Save**.

### Expected
Either **Save** is disabled until Service is chosen, or clicking it shows a
validation message naming the missing field.

### Actual
**Save** is enabled. Clicking it does nothing at all: the dialog stays open, no
message appears, no field is highlighted, and no invoice is created. The
accessibility tree contains no alert or error node afterwards.

### Impact
A user has no way to discover what is wrong. The only visible state is a button
that appears to work and doesn't. This is the kind of defect that generates
support tickets rather than bug reports, because nothing looks broken.

It also has a discoverability edge: the **Service** field does not exist until
the order line inside the dialog is expanded, so a user who never expands it
cannot see the field they are being silently blocked on.

### Evidence
Reproduced during automation. `tests/pages/InvoicesView.ts` documents the
required expand-then-select sequence, and `save()` asserts the button is enabled
before clicking so this failure mode can't hide again.

---

## 2 — Sidebar navigation has no accessible names

**Severity:** High · Confirmed, reproducible.

### Steps to reproduce
1. Sign in.
2. Inspect any sidebar item, or query the page for
   `getByRole('menuitem', { name: 'Orders' })`.

### Expected
Each navigation item exposes its destination as an accessible name.

### Actual
All 22 sidebar items are `li[role="menuitem"]` containing an icon and a text
label hidden with `display:none`. Because the label is display-hidden it is
excluded from accessible name computation, so every item's accessible name is
empty. A role-and-name query for "Orders" returns **zero** matches, while the
visible text sits in the DOM as an unreachable `<span>`.

### Impact
A screen reader user hears 22 unlabelled menu items and cannot tell Orders from
Invoices from Settings. This is the primary navigation of the product. It is a
direct failure of WCAG 2.1 §4.1.2 (Name, Role, Value).

### Recommended follow-up
Add `aria-label` to each item, or replace `display:none` on the label with a
visually-hidden pattern that keeps the text in the accessibility tree. Either is
a small change and fixes the whole navigation at once.

---

## 3 — Intermittent failure to render a signed-in view

**Severity:** High · Reproduced repeatedly; not yet reduced to a reliable
trigger.

### Steps to reproduce
Not deterministic. Observed repeatedly across sessions:
- `/dashboard`, loaded with a restored session, renders as a **single empty
  `<iframe>`** with no application content.
- The sign-in form sometimes never renders at all — the page returns HTTP 200
  and the Email field is still absent after 60 seconds.

### Expected
A navigation that returns 200 renders the view.

### Actual
The shell loads and the application never hydrates. A reload usually recovers
it.

### Impact
Users see a blank page on a URL that "worked a minute ago", with no error to
report. It is also the single largest threat to trusting this test suite: one
full-suite run failed at login and passed on an immediate retry with no code
change, which is exactly the pattern that trains a team to ignore red builds.

### Evidence
`/dashboard` was unusable often enough that the suite now navigates directly to
`/orders/all-orders` instead. `gotoAndWait()` in `tests/helpers/appReady.ts`
reloads once when a view fails to become interactive, and says so when it gives
up.

---

## 4 — About 20 seconds to first interactive paint

**Severity:** Medium · Measured.

### Steps to reproduce
1. Navigate to `/signin`.
2. Time from navigation to the Email field being interactive.

### Expected
Under a few seconds.

### Actual
Measured against this environment: HTTP 200 returned in **~5.5s**, the Email
field interactive at **~21s**. The sidebar behaves the same way after each route
change.

### Impact
Twenty seconds of blank screen is indistinguishable from a broken page. Users
will reload, which restarts the wait.

This may be an artifact of a cold single-instance test environment rather than
production behaviour — worth confirming before treating it as a product defect.
It is stated here because it materially shaped the suite: `actionTimeout` is set
to 45s and the per-test budget to 300s purely to accommodate it, and those
numbers would be misleading without this context.

---

## 5 — Rate cell concatenates two numbers

**Severity:** Medium · Confirmed.

### Steps to reproduce
1. Open **Orders**.
2. Copy the Rate cell of any order, or read it with a screen reader.

### Expected
The rate reads as one value, with the per-mile figure separated from it.

### Actual
The cell renders `$1,234.56` and `0.53 per mi` as adjacent `<span>`s with no
separator, so its text content is:

```
$1,234.560.53 per mi
```

### Impact
Copying the rate yields a corrupted number. A screen reader reads
"$1,234.560.53", which is a different and plausible-sounding amount — the worst
kind of wrong, because it doesn't announce itself as an error. Any export or
integration reading cell text inherits the same corruption.

### Evidence
Found while building the automation: the cell text cannot be parsed as money,
and `OrdersList.rateInRow()` has to read the first `<span>` specifically rather
than the cell.

---

## 6 — Third-party iframe loaded in the invoice view

**Severity:** Medium · Confirmed present; intent unknown.

### Steps to reproduce
1. Open **Invoices** → row menu → **View invoice**.
2. Inspect the page's iframes.

### Expected
A billing surface loads only what it needs.

### Actual
The view loads an iframe from `https://voice.cohere.so/chatPreload/`.

### Impact
A third-party frame on a screen displaying customer billing data is worth a
deliberate decision rather than an accident. If it is an intentional integration,
this finding closes immediately. If it is a leftover from a trial or a
transitively-included widget, it deserves review on both privacy and
supply-chain grounds.

---

## 7 — Grid values absent from the DOM until scrolled

**Severity:** Low · Confirmed. Behaviour, not necessarily a defect.

### Actual
Both data grids virtualise in **both axes**. On load, only the pinned columns
(`__detail_panel_toggle__`, `__check__`, `client`) and roughly 11 rows exist in
the DOM. Rate, invoice status, and amount are absent entirely until the grid is
scrolled horizontally. A single logical row is three DOM elements sharing a
`data-id`.

### Impact
Mostly a cost to automation and to anything reading the page programmatically.
Worth noting for accessibility review, since assistive technology also works
from the DOM.

---

## What was verified as working

Worth stating plainly, because it is the thing the exercise set out to check.

- **An order's rate is preserved exactly through invoicing.** An order created
  at `1234.56` produces an invoice of `$1,234.56`. Verified end to end on a
  freshly created order, compared as exact cents rather than as display strings.
- **The rate is consistent** between the orders list and the invoice.
- **Exactly one invoice** is produced per order — no duplicates.
- **The invoice is correctly linked** to its order, matching on both the app's
  order number and the customer reference.
- **Invoice status propagates** to the order, reading `Invoice Created`.
- **The customer reference round-trips** intact from the form through to the
  invoice.

---

## Not tested

Stated so the coverage isn't overread:

- Invoice **sending**. Deliberately excluded — the dialog's `sendInvoice` field
  defaults to false and the suite asserts it is still false before saving, so no
  test can email a customer.
- Invoice **download**, pending the exploratory report's finding 02.
- **Mark as paid**, and any other state change beyond invoice creation.
- Multi-user, permissions, and any browser other than Chromium.
- Orders with multiple charge lines, non-flat rates, or currencies other than
  USD.
