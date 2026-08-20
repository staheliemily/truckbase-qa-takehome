# AI usage

Where AI was used in this exercise, what it produced, and what happened to that
output before it reached the deliverables.

| Tool | What I used it for | What I changed, rejected, or validated |
| --- | --- | --- |
| _TODO_ | _TODO_ | _TODO_ |
| _TODO_ | _TODO_ | _TODO_ |
| _TODO_ | _TODO_ | _TODO_ |

## Risks I considered

**Hallucinated locators.** I did not let AI write test code before selectors were
captured from the real DOM. A model asked to write a Playwright test for an app
it cannot see will produce plausible, well-formed selectors that match nothing —
and they fail at runtime, in the browser, long after the point where they were
cheap to catch. Recording the flow first meant every locator started from
something that actually existed on the page.

**Findings written by hand.** I wrote the findings myself rather than generating
them from notes. A finding is a claim about product behaviour that someone will
act on; the reasoning about severity and impact is the work, and it is exactly
what is lost when the prose is generated from a summary. Generated findings also
tend to sound more certain than the evidence supports.

**Background research treated as hypotheses.** Anything AI told me about freight
billing — how rates are structured, what normally happens between an order and an
invoice — was treated as a hypothesis to verify against the application, not as
fact. Domain-shaped statements are the easiest kind to get confidently wrong, and
the hardest to notice, because they read as expertise.

**Nothing kept unverified.** Every AI suggestion that survived into the
deliverables was either run against the application or reasoned through until I
could say why it was right. Suggestions I could not verify were dropped rather
than included with a hedge.
