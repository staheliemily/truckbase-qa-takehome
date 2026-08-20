# Release recommendation

## The recommendation

**Hold.** Do not ship this workflow.

Two defects independently justify it. An order accepts a negative linehaul rate
and produces a billable invoice for a negative amount, with no validation at any
step. And a created invoice cannot be viewed, downloaded, or sent — the document
the workflow exists to produce cannot leave the system.

Either alone would block a release. The first bills customers wrong and does it
silently. The second means the billing workflow does not complete at all.

## Conditions and risks

The recommendation flips to **ship with conditions** when both critical defects
are fixed and covered by the regression tests described below, and when the
following hold:

- **Rate validation is enforced server-side, not only in the form.** A fix that
  only disables the submit button leaves the API accepting negative rates. The
  regression test should assert the rejection, not the disabled control.
- **Invoice delivery is verified end to end**, including the PDF actually
  rendering in the viewer, not just the viewer opening. That distinction cost
  time during this exercise and is easy to get wrong again.
- **The silent-save defect in the invoice dialog is fixed or documented.** Service
  is required, Save is enabled without it, and clicking Save does nothing and says
  nothing. It does not block release on its own, but it will generate support
  load from users who cannot tell what is wrong.

Accepted knowingly if the above are met:

- **The accessibility defect in the sidebar ships.** Every navigation item is an
  unlabelled icon, which fails WCAG 2.1 §4.1.2. This is a real defect and a
  compliance exposure, but it is not in the billing path and the fix is
  independent. It should be scheduled, not gated on.
- **Coverage is narrow.** One scenario, one browser, one customer, one flat rate.
  The risks listed as uncovered in the test approach stay uncovered.
- **Environment behaviour is unverified against a production build.** See the
  environment notes in the README; the observed latency and intermittent render
  failures may not be product behaviour at all.

## Additional testing I'd prioritize

In order, with the reasoning for the order:

1. **Negative and zero rates.** Closes the highest-severity open defect and risk
   7 (incomplete order can be invoiced). A $0.00 or negative invoice reaching a
   customer is an incident, not a bug report.
2. **Invoice delivery — view, download, send.** The second critical defect. Worth
   asserting at the API level as well as the UI, so a future failure identifies
   which layer broke.
3. **Editing an order after it has been invoiced.** Risk 4, entirely uncovered.
   If the rate is editable post-invoice with nothing reconciling the two, records
   diverge silently — the same class of failure as risk 1 and just as quiet.
4. **Duplicate submission under real conditions.** Risk 2 is asserted as a count
   today, which catches a duplicate that already exists. It does not attempt to
   *cause* one. Double-click, retry, and two-tab submission are the actual
   mechanisms.
5. **Invoice preview against saved data.** Risk 8. Cheap once delivery works, and
   it protects the moment where a human approves one thing and the customer
   receives another.

## Manual vs automated split

**Automated** — anything with an exact expected value that will be checked
repeatedly: the rate surviving order → invoice, invoice counts, status
propagation, cross-view consistency, and the two regression tests above. These
are assertions a machine makes better than a person, and their value compounds
because they run on every change.

**Manual and exploratory** — judgement about whether the workflow makes sense.
The silent Save is a good example: automation confirmed the click does nothing,
but noticing that a user is stranded with no feedback is an exploratory finding.
Also manual: the PDF's visual correctness, one-off environment checks, and the
first pass over any new flow, which is where the interesting defects surface
before anyone knows what to assert.

**Not automated deliberately** — invoice sending. The suite asserts the dialog's
send flag is off before saving, so no test can email a real customer. Delivery
should be verified against a mail sink, not by sending.

## CI/CD integration

**Where:** a dedicated test environment, never production. This suite creates real
orders and real invoices; it must be configuration-impossible to point it at
production.

**Trigger:** on pull requests touching the order or invoicing paths, and nightly
against the shared test environment. The suite is too slow for every commit.

**Duration:** roughly five minutes for two test cases against the current
environment, dominated by the application's ~20s first paint rather than by the
tests. Against a production build it should be substantially faster; the current
timeouts would need lowering to match, or they will hide a real regression in
load time.

**What a failure blocks:** a failure in the rate assertions blocks the merge —
that is the money path. A failure in the reliability-sensitive setup should be
triaged rather than auto-retried into green. The environment already produces
intermittent login failures, and papering over them with retries is how a team
learns to ignore its own suite.

**Artifacts:** trace, screenshot, and video on failure, uploaded by the pipeline.
Traces record values passed to `fill()`, including the password — restrict who
can download them.

## Process and product changes for testability

- **Stable test hooks.** The rate field, the invoice status chips, and the invoice
  dialog's Create button are reached today through generated class names,
  positional indexes, and text matching. A `data-testid` on each removes the most
  brittle selectors in the suite. The truck and trailer autocompletes are the
  worst of them and the highest-value place to start.
- **Accessible names on navigation.** Fixing the sidebar defect also makes the
  navigation addressable by role and name, which is the most durable locator
  strategy available. The accessibility fix and the testability fix are the same
  change.
- **Seedable, isolated test data.** The suite creates its own orders with
  timestamped references and deletes nothing, which is correct against a shared
  environment but leaves clutter. An API to seed and tear down a known fixture set
  would make runs cheaper and let tests assert against known state instead of
  whatever exists.
- **A visible validation contract.** The invoice dialog's silent Save is the
  symptom; the underlying gap is that required fields are not marked required and
  failures are not surfaced. Consistent inline validation would remove a class of
  defect and make it assertable.
- **Observability into invoice generation.** The delivery defect could not be
  localized from the UI — it is not possible to tell whether the PDF fails to
  generate or fails to serve. A logged, queryable generation step would turn a
  vague "download doesn't work" into a specific failure.
