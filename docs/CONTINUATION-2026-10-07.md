# ShelfBridge continuation · 7 October 2026

The next missing G3 tool is implemented: resumable collection for the OpenAI-only
baseline, static Qloo and the current OpenAI/Qloo tool loop. Collection defaults
to a read-only dry run. An explicit live invocation uses the shared daily ledger,
locks the runtime, checks current provider evidence, bounds each batch, persists
outcomes and stops at the first failure. Completed failures and empty rankings
remain in the experiment; interrupted paid units are not retried.

B1 receives confirmed taste labels and the full eligible catalog metadata in one
strict Responses request. B2 uses all confirmed Qloo tastes; Full uses the existing
inspect→rank loop. Each uses the same frozen phase-specific brief and constraints.
No-stock slots make zero calls. The manifest now binds the collector, its CLI and
the remaining evaluation/provider boundary code. Preparation refuses to overwrite
an existing collection journal or outcomes. Unknown interruption durations are
reported separately rather than treated as measured zero latency.

Validation: 99/99 automated tests, 23/23 application browser scenarios and 7/7
questionnaire checks pass. Fixture evaluation: 12 tasks, 10 repairs, two no-stock
cases and zero hard-constraint violations. Controlled contracts are not evidence
of real model relevance or a successful live comparison.

The refreshed experiment is prepared with 176 outcome slots (22 B0, 154 provider
slots). Its previous preparation artifacts were copied to a dated local archive.
Dry run reserves zero calls; the live collector is correctly blocked by the
missing successful planner smoke. No real comparison results or human ratings
have been collected. See [BENCHMARK.md](BENCHMARK.md) for execution and recovery.

A fresh real OpenAI diagnostic still returns HTTP 429 /
`credit_balance_exhausted` / `insufficient_quota`. The shared ledger records two
reservations today: one unsuccessful sandbox-network attempt and one real billing
diagnostic. No further provider requests or budget increases followed. Qloo's
successful 6 October controls remain current and were not repeated.

The local app remains in fixture mode. Completing the full live journey requires
restored OpenAI access, successful planner and HTTP smoke evidence, then gated
activation. Independent human ratings, public source and externally tested HTTPS
hosting remain open. This continuation completes collection tooling, not the
whole hackathon release.
