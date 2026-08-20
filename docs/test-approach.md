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

<!-- TODO: fill in after exploration -->

## Not tested, and why

Out of scope per the brief: trips and dispatch, driver pay and settlements, QuickBooks sync, quote conversion, EDI, payment gateways, performance.

Additionally skipped given the 2–3 hour budget and the instruction to favor depth over breadth: cross-browser coverage, a full accessibility audit, and deep field validation off the critical path.

## Assumptions

- A flat rate means no line-item breakdown
- The invoice flow ends at sent rather than paid
- Seeded customers have valid billing configuration
- Single currency

## Questions for product and engineering

<!-- TODO: fill in after exploration -->