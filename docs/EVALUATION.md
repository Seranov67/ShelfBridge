# Evidence required before a high jury score

Current tests prove local behavior, not cultural recommendation quality. Fixture
ranking is hand-authored theme sorting. Its performance must not be presented as
Qloo's performance, or as evidence of user impact.

## Freeze before running the benchmark

Use the same approved shelf, edition facts, budget and confirmed input IDs for:
1. B0: deterministic curated shelf / simple permitted metadata baseline.
2. B1: the same LLM and eligible shelf, without Qloo.
3. B2: a static Qloo query at each declared phase, without the LLM agent.
4. Full: bounded LLM/Qloo workflow with confirmed repair.

No real popularity data is available in this simulated shelf. Do not fabricate
popularity to describe B0. Register its exact deterministic ordering before runs.
Give B1 a fair prompt, full eligible metadata and the same constraints. Keep raw
Qloo rank separate from local SKU facts. Three independent stochastic runs per
task for B1/Full; do not cherry-pick. Run all tasks, including no-match outcomes.

## Twelve predeclared tasks

Search identities must be confirmed against live Qloo. The titles below are
queries, not assumed API entity IDs. They are not claims of expected top books.

| Task | Recipient tastes | Budget | Unavailable | Repair |
|---|---|---:|---|---|
| T01 | Amélie + AURORA | $25 | The Priory of the Orange Tree | already owns first choice |
| T02 | Arrival + Radiohead | $25 | A Memory Called Empire | budget $16 |
| T03 | Knives Out + The Grand Budapest Hotel | $20 | Gone Girl | exclude first choice |
| T04 | Before Sunrise + Hozier | $20 | Normal People | budget $14 |
| T05 | Interstellar + Arrival | $23 | A Memory Called Empire | remove Interstellar |
| T06 | Her + Radiohead | $20 | Normal People | already owns first choice |
| T07 | A Wizard of Earthsea + AURORA | $18 | The Priory of the Orange Tree | budget $15 |
| T08 | Piranesi + Amélie | $22 | The Night Circus | already owns first choice |
| T09 | The Thursday Murder Club + Knives Out | $18 | Gone Girl | budget $13 |
| T10 | The Long Way to a Small, Angry Planet + Hozier | $22 | A Memory Called Empire | remove Hozier |
| T11 | Arrival + Radiohead | $1 | A Memory Called Empire | honest no-stock, no calls |
| T12 | Amélie + AURORA | $11 | The Little Prince | honest no-stock, no invention |

For a fair comparison, exclusion tasks use one fixed work declared before runs
for every method. The interactive fixture test still excludes its actual first
choice; those are separate checks. The executable manifest uses the first
B0-sorted eligible work as the predeclared exclusion.

Fix task order randomization seed and versioned prompts/config before collection.
Record resolved IDs, call counts, latency, source failures, omitted coverage,
returned titles, hard-constraint violations and all repair outcomes. Treat empty
ranking as an observed result, not a reason to secretly modify the shelf.

## Human comparison

Aim for 2 booksellers/librarians and 5 gift buyers; availability is unconfirmed.
Show source-blinded methods in randomized order. Ask participants to complete a
gift choice and a repair; record elapsed time, completion without assistance and
relevance rating 1–5 with consent. Never invent participants, testimonials or sales.

Predeclared internal goals: 0 hard-constraint violations, 0 fabricated facts,
Full median relevance at least +0.5/5 over B1 and not worse than B0; at least 4/5
buyers finish without assistance; at least 2/3 selected repair tasks improve under
independent assessment. Small N is not statistical proof of a general benefit.
If Full ≈ B2 or B1, report that result and change the product hypothesis.

## Jury review today

- Design: complete local workflow and inspected desktop/mobile screenshots.
- Implementation: automated invariants and tool-loop contract are tested; real
  Qloo/LLM end-to-end is not yet verified.
- Idea: focused stock-constrained gift replacement hypothesis; novelty is not
  proven and competing gift/book recommenders exist.
- Impact: unvalidated. No real store partner, user test or measured lift.

**Do not assign an invented high score. Release remains NO-GO until evidence
closes the live integration, hosting and user-validation gaps.**

Executable preparation, source-blinded offline questionnaires, capture validation
and paired summaries: [BENCHMARK.md](BENCHMARK.md). `npm run benchmark` makes
zero provider calls. It is not a completed human study or a live benchmark runner.
