# Test Approach

*Written before exploring the application.*

## Risk list

| # | Risk | What happens |
|---|------|--------------|
| 1 | **Wrong amount billed** | The flat rate doesn't survive the trip from order to invoice. Customer pays the wrong price; caught at reconciliation, if ever. |
| 2 | **Duplicate invoice** | Double-click, retry, or two tabs creates two invoices for one load. Customer billed twice, messy to unwind once money has moved. |
| 3 | **Invoice exists but the order doesn't know it** | Invoice created, order status never updates. Load looks unbilled and gets billed again. |
| 4 | **Order and invoice quietly diverge** | Rate, customer, or stops editable after invoicing with nothing reconciling the two. Records stop matching and nobody is told. |
| 5 | **Views disagree** | Order shows one status or rate in the overlay, another in the orders list or invoices view. Whoever's chasing payment can't tell what's true. |
| 6 | **Can't bill at all** | Order or customer fails to save correctly, so nothing invoiceable exists. Revenue delayed — ranked here rather than higher because it's loud and gets caught fast. |
| 7 | **Incomplete order can be invoiced** | Missing customer, zero rate, or a single stop still produces an invoice. A $0.00 invoice reaching a customer is a real incident. |
| 8 | **Preview doesn't match what's saved** | You approve one thing, the customer receives another. |
| 9 | **Order data saves wrong** | Second stop missing, stops out of order, delivery dated before pickup. The invoice then bills for a load that isn't what was arranged. |
| 10 | **Order doesn't appear in the list** | Requires a hard refresh to show up. Low money impact, but high nuisance for dispatchers. |

## Ranking rationale

Ranked by consequence and detectability rather than likelihood, since this was written before exploring the app. Money impact comes first; among equal-impact risks, the quieter failure ranks higher, because in billing the error nobody catches is the expensive one. This is why "can't bill at all" sits mid-list despite sounding severe — it is the loudest possible failure and would be caught within a day.

## Scenarios prioritized, and why

Risks 1–5. They cover the money path and the cross-view consistency the brief points at twice. Risks 6–10 receive incidental coverage while walking the happy path.

## Edge cases considered

Rate values, because risk 1 is the top risk and the rate is the value that has to
survive the whole path:

- **Negative rate.** Exercised. Accepted with no validation and produces a
  billable invoice — finding 1.
- **Zero rate.** Not exercised. Same code path as negative and the same class of
  incident if it reaches a customer; the next test I would write covers both.
- **More than two decimal places, and rounding.** Not exercised. Worth knowing
  whether the invoice rounds, truncates, or stores the extra precision, because a
  half-cent difference reconciles badly at volume.
- **Very large rate.** Not exercised. Formatting and precision limits.

Identifiers and duplication:

- **Customer order # format.** Exercised incidentally. It accepts long numeric
  references; whether it accepts letters, punctuation, or has a length cap is
  unconfirmed, and the automation had to work around not knowing.
- **Two invoices for one order.** Asserted as a count, so a duplicate that exists
  would be caught. Not provoked — double-click, retry, and two tabs are the real
  mechanisms and none were attempted.

Order shape and dates:

- **Delivery dated before pickup.** Not exercised. Risk 9; the invoice would then
  bill for a load that could not have run.
- **Stops in the wrong order, or a missing second stop.** Not exercised beyond
  the happy path.
- **Month boundary in the date picker.** Considered and deliberately excluded —
  the picker offers no month navigation that automation could reach, so a run in
  the last days of a month fails with a stated reason rather than silently
  picking the wrong month.

Invoice completion:

- **Required fields on the invoice dialog.** Exercised. The Service line is
  required, nothing marks it required, and Save is enabled without it — see the
  questions below.
- **Invoicing an order twice.** Not exercised.

## Not tested, and why

Out of scope per the brief: trips and dispatch, driver pay and settlements, QuickBooks sync, quote conversion, EDI, payment gateways, performance.

Additionally skipped given the 2–3 hour budget and the instruction to favor depth over breadth: cross-browser coverage, a full accessibility audit, and deep field validation off the critical path.

## Assumptions

- A flat rate means no line-item breakdown
- The invoice flow ends at sent rather than paid
- Seeded customers have valid billing configuration
- Single currency

## Questions for product and engineering

Raised by what exploration actually turned up, in the order I would ask them:

1. **Should a negative or zero rate be rejected, and at which layer?** Today
   neither the form nor the API stops it. If the fix is form-only, the API still
   accepts it and any other client can still produce a negative invoice.
2. **Is the invoice document expected to be viewable and downloadable in this
   build?** Creating an invoice succeeds, but it cannot be viewed, downloaded, or
   sent. If delivery is not in scope for this release, that changes the release
   call significantly — and should be stated rather than inferred.
3. **Is the Service line on the invoice dialog required?** It behaves as
   required, but is not marked required, and Save is enabled without it and
   silently does nothing when clicked. If it is required, the validation is
   missing; if it is not, something else is failing silently.
4. **Is a third stop required to create an order?** The workflow specifies two.
   Order creation did not appear to complete with two during exploration, which
   would contradict the brief — I could not confirm which is intended.
5. **What are the intended invoice status values and transitions?** The orders
   list shows `Invoice Created` while the invoices list shows `Created` for the
   same invoice. Both are reasonable in isolation; whether they are meant to be
   the same vocabulary is a product question, and it matters for risk 5.
6. **Is the third-party iframe on the invoice view intentional?** The invoice
   view loads `voice.cohere.so`. On a screen showing customer billing data that
   should be a deliberate decision.
7. **Is the observed latency a dev-build artifact?** Roughly 20 seconds to first
   interactive paint, with intermittent failures to render at all. If this is the
   environment rather than the product, the release risk is very different — and
   the test suite's timeouts should be retuned before it runs anywhere else.
8. **Are stable test hooks planned?** The rate field, status chips, and the
   invoice Create button are reachable today only through generated class names
   and positional selectors. A `data-testid` on each would remove the most
   brittle parts of any automation written against this workflow.