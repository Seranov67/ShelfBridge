# Reproducible recommendation comparison

This is preparation for G3, not a completed quality study. `npm run benchmark`
never calls Qloo or OpenAI. No people, ratings or provider success are invented.
The reviewed local identities now allow a prepared manifest. This does not
establish recommendation quality or a successful OpenAI run.

## Freeze the experiment

```sh
npm run benchmark -- prepare data/qloo-review.json
```

Without an input, the command uses the local review if present, otherwise the
unresolved example. It writes ignored `test-results/benchmark/plan.json`,
`baseline.json` and `capture-template.json`. A blocked manifest exits 1 but still
provides useful preparation. Re-run only before collecting outcomes. Keep a
separate archive of a completed experiment before starting another one.

The fingerprint freezes catalog facts, confirmed identities, model, task inputs,
prompts, code hashes, harness version, seed, baseline order and repairs. Changed
code/catalog or an edited/rehashed protocol is rejected. These are consistency
checks; they do not authenticate the operator or prove a real provider call.

There are 176 outcomes: 12 tasks × 8 method/runs, plus 10 repairs × 8. B0/B2
have one run; B1/Full have three. T11/T12 have no eligible shelf and must spend
zero calls. B0 contributes 22 deterministic outcomes; collect all 154 remaining
outcomes, including failures. B0 sorts title, author, workKey in Unicode
code-point order, with no fabricated popularity data.

All methods use the same task and repair. For an exclusion, the excluded work is
declared as the first B0-sorted eligible work *before collection*, not the first
result of each method. It may not be recommended by a method. This experiment
tests the shared updated brief. The existing fixture acceptance test separately
tests rejection of the current top recommendation in the interactive product.

B1 gets full eligible metadata and the frozen fair prompt without Qloo. B2 uses
static all-confirmed Qloo at both phases. Full uses the current bounded tool loop.
No primary taste is declared, so the current Full may be identical to B2: that is
a result to measure honestly, not an expected agent advantage.

## Collect and validate

The package supplies a resumable collector for B1, B2 and Full, plus the
validator/importer. Its provider contracts have local controlled tests; a real
collection still requires working access. The collector uses the shared daily
ledger and approved Qloo CLI. Stop the local server before a paid collection.

```sh
npm run benchmark:collect
# Only after a successful current planner smoke and P00:
node --env-file-if-exists=.env scripts/collect-benchmark.mjs --live --max-units=8 --max-calls=12
```

The default is a read-only dry run with zero provider calls. `--live` requires
current reviewed mapping, matching model, verified P00, contract approval,
supported CLI and successful planner smoke. It does not enable the application
live mode. Each invocation processes at most eight missing outcomes and reserves
at most twelve calls by default. The flags can lower these limits; the invocation
call cap cannot exceed 60 and never raises the configured daily cap. Before each
unit, enough headroom for its worst-case call count is required. Collection stops
at the batch/day boundary or immediately after the first provider failure.
Use the direct Node command for flags in PowerShell; an npm wrapper may consume
flags before the collector receives them.

Run the same command on a later quota day to resume. `collection.json` is the
authoritative atomic journal; `captures.json` is exported after each checkpoint
for the existing check/blind/summarize workflow. Completed outcomes, including
failed and empty rankings, are never rerun. Independently imported captures
cannot overwrite or be silently adopted into a journal. Keep both files when
archiving an experiment. `prepare` refuses to overwrite collected outcomes;
changed code, mapping, model or protocol requires a separate experiment.

An unfinished paid unit is recorded as `collector_interrupted` on resumption,
with unknown `durationMs: null`, and that invocation stops without retrying it.
Unknown durations are counted separately and excluded from latency medians.
An unfinished no-stock slot can be reconstructed without a call. Reservations
are saved in the shared ledger before dispatch and then checkpointed in the
journal. A process crash between those writes can leave a ledger reservation
absent from the outcome's call count; it remains spent in the daily budget.
Journal recovery cannot prove whether an interrupted request reached a provider.

B1 sends the full eligible shelf metadata and confirmed taste names/types to a
single OpenAI Responses request, without Qloo IDs or tools. Its strict output
schema uses [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses);
the server still rejects foreign or repeated works, extra fields, refusals and
incomplete responses. B2 ranks the same shelf with all confirmed Qloo tastes.
Full invokes the existing bounded inspect→rank tool loop. All three receive
the frozen phase-specific request; repairs are independent rerankings of that
shared updated brief, without method-specific conversation history. A no-stock
unit bypasses all providers. No method substitutes teaching data on a failure.

On complete successful collection, the plan needs 80 Qloo calls, 60 B1 OpenAI
calls and 120–180 Full OpenAI calls: 260–320 total, excluding identity searches
and P00. A daily cap of 60 therefore requires at least 5–6 quota days. Reserve
failed attempts too. Do not raise limits merely to finish a study. The live
collector must stop at the cap and resume only missing outcomes; never rerun
failures to select better results.

Fill every entry of `capture-template.json` into a separate `captures.json`.
Fields are minimal: exact unit ID, state, ordered workKeys (maximum 3), durationMs,
call counts, declared source/model, UTC `recordedAt` such as
`2026-10-05T12:00:00.000Z`. That timestamp is an example format, not an actual
measurement. For a failure use state `failed`, empty workKeys, actual reservations
and a bounded lowercase `failureCode`; exclude raw error text and secrets.
Only `failed` / `collector_interrupted` may use an unknown `durationMs: null`.
Allowed states also include `ready`, `insufficient_taste_data`,
`no_eligible_stock`. No-stock outcomes still retain the declared method/model,
with zero calls. These labels identify the planned method, not evidence it ran.

```sh
npm run benchmark -- check test-results/benchmark/captures.json
```

The command adds its immutable B0 automatically; do not duplicate B0 in captures.
Unknown/duplicate units, foreign or repeated works, changed facts via extra
fields, incorrect source/model/state, excessive calls and incomplete data fail.
Observed failures/empty rankings remain visible; they are not substituted.

## Source-blinded human review

```sh
npm run benchmark -- blind test-results/benchmark/captures.json P01
```

This requires reviewed identities and all 176 valid outcomes, including failed
ones. It creates `P01-review.html`, public packet/empty ratings JSON and a
**PRIVATE** method key. Share the HTML only with its intended consenting
participant; keep the method key local. Each anonymous P01…P30 participant gets
a deterministic different randomized ordering. The HTML contains catalog facts
but no method, provider, model, Qloo IDs or failure details. It makes no network
requests and stores no answers on a server.

Participants select their role, rate relevance 1–5 or skip, then download answers.
They can import their original saved answers to continue. Reload clears unsaved
answers. Failed/empty/no-stock outcomes cannot be rated. The optional buyer task
report requires actually trying the app and records completion, assistance and
elapsed seconds; reviewing lists alone does not count. There are many sets, so
allow breaks and retain partial participation as missing data.

Combine returned answer objects into an `assessments.json` array. Do not publish
individual answers or participant files by default.

```sh
npm run benchmark -- summarize test-results/benchmark/captures.json test-results/benchmark/assessments.json
```

The report rejects absent consent, wrong packet, duplicate participants, invalid
scores and ratings for unavailable outcomes. It reports all capture/missing
rating denominators, failures, empty rankings, call counts and latency per method.
Three stochastic ratings are collapsed to one median per participant/task before
paired comparisons, preventing repeat runs from counting as extra people.
Repair relevance changes are reported for predeclared T01/T03/T06. Usability and
recommendation relevance are separate measurements. Missing cells produce null
comparisons rather than invented scores; no report automatically awards a pass.

Aim for 5 buyers and 2 book experts. Internal goals remain those in
[EVALUATION.md](EVALUATION.md). Small samples, partial ratings, identical outputs,
memory/order effects and operator-supplied evidence limit conclusions. If Full
does not beat B2, do not claim an agent improvement. Relevance is not sales impact.

Questionnaire QA: `npm run test:benchmark-browser`, with the same optional
Playwright/Chrome environment paths as the application browser runner. Synthetic
rehearsal reports never become human study results.
