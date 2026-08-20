# AI Usage

I used AI tools the way I do in normal QA work: for structuring,
reviewing, and accelerating research, while keeping the judgment calls
and the actual testing my own.

| Tool | What I used it for | What I changed, rejected, or validated |
|------|--------------------|----------------------------------------|
| Claude (chat) | Structuring the risk list and pressure-testing my ranking | Reordered several risks and rewrote the entries in my own words. Rejected the suggestion to score risks numerically — a 1–5 matrix on a 2-hour exercise is process theater, not judgment. |
| Claude (chat) | Background research on TMS and freight-billing failure modes before starting | Treated as hypotheses, not findings. Discarded the accessorial and fuel-surcharge material as irrelevant once I noted the brief specifies a flat rate, which removes calculation from scope. |
| Claude Code | Scaffolding the Playwright project and doc structure | Kept the config, the env wiring, and the cross-view consistency helper. Replaced the auth setup entirely — it was a stub with guessed selectors, and every one was wrong against the real app. Found a bug in the consistency helper while wiring it up: two blank views normalised to the same sentinel and compared as *consistent*, so a value that never propagated would have passed. |
| Claude Code | Converting a `playwright codegen` recording into page objects, helpers, and two specs | Validated every selector against the running app rather than trusting the recording. Rejected its implied click order for invoicing — the charge type has to be set *inside* the dialog before saving, not after, so following the recording produced a test that never created an invoice. Caught an AI-authored regex bug (`\s` inside a template literal collapses to a literal `s`) that silently broke every grid lookup. |

## Risks I considered

**Hallucinated selectors.** I deliberately did not let AI write test
code before I had seen the DOM. I captured real selectors with
`playwright codegen` first, then used AI to refactor them into
role-based locators. Reversing that order produces confident, wrong
code that costs more time to debug than to write by hand.

**Generic-sounding findings.** I wrote the findings myself rather than
generating them from notes. AI-written defect reports read fluently but
lose the specific detail that makes a bug reproducible, and the
reasoning needs to be mine since I have to defend it.

**Plausible-but-wrong domain assumptions.** Background research on
trucking billing produced confident claims I could not verify against
this build. Anything from that research is marked as an assumption to
verify rather than stated as fact.

**Verification burden.** Every AI suggestion I kept, I either ran or
reasoned through myself. The value was in speed of structuring and in
catching things I would have missed, not in output I accepted
unexamined.