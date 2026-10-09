# ShelfBridge

**A different book. The same thoughtfulness.**

ShelfBridge helps a gift buyer find a thoughtful alternative when their first-choice
book is unavailable. The recipient's confirmed films, music and books guide a
shortlist that fits the available shelf and maximum budget.

The prototype uses **simulated inventory: 30 book works and 31 SKUs**.
It makes no purchase or reservation.

The primary application mode is **real Qloo with a deterministic workflow and
no LLM**. `npm start` defaults to `qloo_only`, loads an optional local `.env`, and
refuses to start without current configuration and live evidence. OpenAI is not
required. The historical Qloo-only journey passed on 7 October; the deployment
changes require fresh evidence before activation. This checkout has no credentials
or successful live reports. See [Qloo-only setup](docs/QLOO-ONLY.md).

[Publishing the complete app on Vercel](docs/DEPLOYMENT.md) explains the prepared
hosting configuration: static UI, a Node Function and shared Upstash Redis state.
No separate VPS or built-in LLM is required. MCP can connect to the published
Vercel HTTPS API with explicit `--remote`. A local build does not publish a site.

The [local MCP bridge](docs/AGENT-MCP.md) exposes six tools to an existing agent
without using the OpenAI API. Its real Qloo protocol journey passed 13 checks
before the latest gift-copy update; an external LLM agent run remains unverified.
A connection template is included.

## Run the local demo

Use Node.js 22.19 or newer. Fixture mode needs no package installation or API keys.

```sh
npm run start:fixture
```

Open [ShelfBridge locally](http://127.0.0.1:4318/). The badge should read
**Teaching demo · Qloo offline**. This explicit command overrides a configured
live mode. The direct `node src/server.mjs` command remains a fixture-first
development entrypoint without loading `.env`; `npm start` is the Qloo-first
application launcher.

1. Click **Try a gift rescue**. Review Amélie and AURORA, the unavailable book
   and the $25 maximum.
2. Click **Find the thoughtful alternative** to confirm the brief.
3. Exclude an already-owned book and confirm the rebuild.
4. Lower the budget to $15 and confirm another rebuild.
5. Open **Why these choices?** to inspect the source and decision trail.
6. Choose a gift and copy or print its card.

Fixture ordering is hand-authored teaching data and the workflow is deterministic.
It never calls Qloo or OpenAI, even when credentials exist.

## English demo and submission materials

- [Project description for Devpost](docs/SUBMISSION-DRAFT.md)
- [Demo script, captions and recording instructions](docs/DEMO.md)
- [Setup and testing instructions for judges](docs/JUDGING.md)
- [Validation history](docs/VALIDATION.md)

The interface, README, project description, demo captions and judging instructions
are in English. The current recording is a local fixture walkthrough.

## How it works

The browser sends a gift brief to a same-origin Node server. Cultural search
matches must be explicitly selected. The unavailable gift is excluded from stock
eligibility and is not silently treated as a recipient preference.

Server policy chooses the cheapest eligible edition for each work and enforces
stock, currency, price, budget and exclusions before ranking. Live mode uses a
bounded OpenAI Responses tool loop: `inspect_shelf`, then `rank_shelf`. Qloo ranks
the eligible book whitelist using confirmed taste IDs. A focused query is allowed
only when the user explicitly selects a primary taste.

Neither provider can change prices or stock, invent catalog IDs, raise the budget
or loosen exclusions. Results contain up to three distinct works. The user can
confirm two refinements, compare selections and generate a gift card. Editing an
existing brief pauses old gift choices until a new selection is confirmed.

The evidence panel identifies the source, tastes used, shelf boundary, coverage,
decision reference and tool trace. Affinity is not presented as a probability of
liking. Model prose is not used as verified factual evidence. Live failures
produce errors and are never silently replaced with fixture results.

Shortlist cards show the existing catalog descriptions for comparison. Per-book
ranking details stay in the evidence panel. Gift cards and copied notes use a
friendly draft message and the selected book description, separate from ranking
provenance; simulated inventory and no-purchase notices remain visible.

## Verified status as of 7 October 2026

| Evidence | Result | Scope |
| --- | --- | --- |
| Real Qloo identity review | 29/30 works; all 26 eligible works mapped | Metadata review by Codex; no independent human review claimed |
| Real Qloo P00 controls | 13/13 passed; 10/10 nonempty taste profiles | Two disjoint shelves and an actual exclusion control |
| Node tests | 119/119 passed | Policy, sessions, HTTP, provider contracts, collection, MCP and stale-lock recovery |
| Browser acceptance | 27/27 passed; no JavaScript errors | Fixture flow, descriptions, copied note, recovery, keyboard and mobile at 320/390 px |
| Qloo-only HTTP journey | 8/8 checks passed; 5 Qloo calls, 0 OpenAI | Real searches, decisions, exclusion, $15 rebuild, gift and no-stock bypass |
| MCP stdio journey | Prior build: 13/13 live checks; 5 Qloo, 0 OpenAI | Scripted client before gift-copy update; no LLM agent claim |
| Qloo-only browser rehearsal | 10/10 passed; no JavaScript errors | Controlled provider data; descriptions, gift, mode labels, manual confirmation, recovery and 320 px |
| Real OpenAI planner | Blocked by `credit_balance_exhausted` | No successful live planner run |
| Benchmark collection tools | Prepared; 7/7 questionnaire browser checks | No real provider outcomes or independent ratings collected |
| Full Qloo + OpenAI journey | Not yet verified | Fixture walkthrough is separate evidence |
| Public demo and repository | Not yet published | Current demo runs locally |
| Independent user outcomes | Not collected | No satisfaction, sales or benchmark lift claim |

These are dated results, not guarantees about future builds or provider balances.
The unmatched book has zero stock and cannot enter the eligible shelf.
See [validation](docs/VALIDATION.md) for scope and historical checks.

## Configure and verify live mode

Live mode defaults to the official Qloo harness **0.1.26** and requires Node 22.19+.
See [CLI setup](docs/QLOO-CLI.md). The CLI transport passed real event-key P00
controls. The optional `http_legacy` adapter is not the verified event path.

Store credentials only in the server environment or an ignored local `.env`.
Use `.env.example` for variable names; never put keys in browser code or a public
repository. The default OpenAI model is `gpt-4.1-mini`, configurable with
`OPENAI_MODEL`. Qloo uses the organizer-provided API server and an eligible-shelf
`filter.results.entities` boundary; OpenAI uses the Responses API.

`npm run preflight` checks configuration and existing evidence without provider
calls. For a fresh mapping, review exact titles, authors and taste identities,
then follow [P00 preparation](docs/QLOO-P00.md). Do not automatically accept the
first search match. For the Norwegian singer AURORA, search **Aurora Aksnes**.

On this workstation the Qloo controls are complete. After restoring OpenAI API
access and daily call headroom, stop the app and run:

```sh
npm run smoke:llm
npm run smoke:live
npm run preflight:live
npm run enable:live
npm start
```

Stop if a command fails. Smoke tools reserve calls in the shared daily ledger
and make no automatic retries. The full journey needs at least 14 available calls.
`enable:live` changes only the ignored local `.env`, and only after current Qloo,
planner and full HTTP journey evidence pass. It makes no provider calls.
Evidence is bound to the reviewed plan, model and current server code.

To use real Qloo while the OpenAI planner is unavailable, follow
[QLOO-ONLY.md](docs/QLOO-ONLY.md). That mode has its own smoke/preflight/activation
gate, uses the same daily call cap and never calls OpenAI. It is a verified
recommendation workflow. The [MCP tools](docs/AGENT-MCP.md) are verified; running
them with an external LLM agent remains a separate evidence gate.
`npm run preflight` checks the configured mode; `preflight:live` explicitly checks
the two-provider mode even when Qloo-only is active.

## Validation and demo recording

```sh
npm test
npm run evaluate:fixture
npm run test:browser
npm run demo:record
```

Browser checks and recording need an existing Playwright development installation
and Chrome or Chromium. Set `PLAYWRIGHT_PACKAGE_PATH` and `BROWSER_EXECUTABLE`
if they are not found automatically; see [demo instructions](docs/DEMO.md).
Both default to an isolated fixture server and make no external provider calls.
Reports, screenshots and recordings go to ignored `test-results/`.

The [benchmark workflow](docs/BENCHMARK.md) prepares a B0/B1/B2/Full comparison.
`npm run benchmark:collect` checks the frozen collection plan with
zero provider calls. The opt-in live collector saves progress, respects the shared
daily budget and preserves failures without retries. Preparation and controlled
tests do not establish model benefit or cultural relevance; real collection and
independent human ratings remain uncollected.

## Hosting and operating limits

The Dockerfile and `compose.yaml` are deployment starting points, not a verified
published service. Use one process/replica, an HTTPS reverse proxy and persistent
`.runtime` storage. Set `PUBLIC_HTTPS=true` for secure session cookies. The runtime
lock prevents concurrent processes sharing the local ledger. Confirm no process
remains before removing a stale lock after a crash.

The default daily cap reserves **60 provider attempts**, including failures, and
persists across restarts. This is a call cap, not a monetary spending limit.
Decisions have a 20-second deadline, at most three LLM calls and one Qloo ranking.
Sessions allow 20 searches, six decision cycles and two refinements per brief;
they expire after 30 minutes, with at most 200 stored sessions.

Public release still needs a tested HTTPS service, provider spending controls,
public source repository and judging-period availability. Multi-replica hosting
requires a transactional shared budget store. No personal identifiers, payment
details or persistent customer history are collected.

## License and references

MIT; see [LICENSE](LICENSE) and [provenance](docs/REUSE.md).
Submission requirements: [official Qloo rules](https://qloo.devpost.com/rules).
Integration: [Qloo developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide)
and [official event kit](https://github.com/qloo/qloo-hackathon-kit).
