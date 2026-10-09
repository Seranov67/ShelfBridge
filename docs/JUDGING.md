# ShelfBridge — Setup and testing instructions

Updated 9 October 2026. Qloo-only is the primary application mode.
A public live demo and repository have not yet been published.

## Choose the correct mode

**Fixture:** available now, uses teaching data and a deterministic workflow.
No Qloo or OpenAI calls are made. The interface says
**Teaching demo · Qloo offline**.

**Qloo-only:** the primary mode, requiring verified runtime configuration. Real Qloo
searches and rankings use a deterministic server workflow, with no OpenAI calls.
The badge says **Live Qloo · no LLM · demo inventory**. The complete HTTP journey
historically passed eight checks with five Qloo calls and zero OpenAI. The
deployment source changes require fresh evidence. Follow
[Qloo-only setup and testing](QLOO-ONLY.md) for manual taste confirmation.

**Experimental live planner:** the Qloo CLI and its 13 controls passed. The full Qloo + OpenAI journey
has not passed because OpenAI API credits are exhausted. Do not treat the fixture
walkthrough or recording as evidence of a working live agent.

**MCP agent tool:** six tools connect an existing agent to the Qloo-only server.
The real stdio protocol journey passed 13 checks with five Qloo calls and zero
OpenAI. The client was scripted; an external LLM agent run is still unverified.
See [connection and testing instructions](AGENT-MCP.md).

## Local setup without keys

1. Obtain the project source and install Node.js 22.19 or newer.
2. Open a terminal in the project directory.
3. Run `npm run start:fixture` to explicitly select the offline walkthrough.
4. No package installation or API key is needed for this mode.
5. Open http://127.0.0.1:4318/ and verify the fixture badge.

The launcher loads an optional local `.env`; the fixture flag overrides its mode.
`npm start` defaults to Qloo-only and requires current live evidence.
No login or customer details are needed. If port 4318 is occupied,
set `PORT` to a free port and use that address.

## Test the main journey

| Action | Expected result |
| --- | --- |
| Click Try a gift rescue | The unavailable original book, $25 budget, Amélie and AURORA appear for review |
| Click Find the thoughtful alternative | Three distinct works from simulated stock, all within $25 |
| Click Already owned / exclude on one card | A confirmation explains that every edition of the work will be removed |
| Click Confirm & rebuild | The excluded title is absent; a before/after panel appears |
| Set the lower budget to $15 and click Rebuild | The new limit needs explicit confirmation |
| Confirm the change | Cards cost no more than $15; the brief shows the new limit |
| Open Why these choices? | Fixture source, deterministic workflow, signals and eligible shelf boundary are visible |
| Click Choose this gift | A gift card shows the book, author, edition and simulated price |
| Close the card and reload | The current selection is restored while the session remains valid |

Copy and print controls are available. Physical printing and OS clipboard delivery
are not established by automated checks.

## Check boundary cases

- Change a confirmed brief without submitting it: previous gift choices pause.
- Set the budget to $1 and submit: no eligible stock is reported, with no forced
  recommendation or provider ranking.
- Use the page at 390 px or 320 px width: there should be no horizontal overflow.
- Navigate with Tab and Enter: controls have visible keyboard focus.
- Sessions expire after 30 minutes. Reconnect or start a fresh brief when needed.

## Live setup for the project operator

Use Node 22.19+ and the pinned Qloo harness 0.1.26. Store credentials server-side.
Follow [CLI setup](QLOO-CLI.md), [P00 controls](QLOO-P00.md) and the
[README](../README.md). Stop the app before shared-ledger smoke tools.

After genuine current P00 controls and sufficient daily headroom, run
`npm run smoke:qloo`, `npm run preflight:qloo` and `npm run enable:qloo` in order.
Stop on failure. Follow [complete Vercel deployment](DEPLOYMENT.md) for shared
Redis state and public hosting. Judges should use the verified hosted build
without supplying their own provider credentials. No OpenAI or local LLM is required.

In a verified live session, search Amélie as a film and Aurora Aksnes as an artist,
inspect disambiguation and explicitly select the correct identities. The
unavailable book is an exclusion, not an implied taste. Keep the primary-taste
selector empty for the all-confirmed flow.

The evidence panel must show live Qloo and deterministic/no-LLM execution. Actual
rankings may differ from fixture ordering. Empty rankings and provider errors
must be reported honestly.

## Current evidence and limits

Historical real Qloo: 13/13 controls and 10/10 nonempty profiles. Qloo-only has
separate historical real HTTP evidence; current deployment activation needs
fresh reports. The two-provider journey is unverified. Current offline and Redis
checks are recorded in [validation history](VALIDATION.md).
Benchmark collection tooling is prepared;
real comparison outcomes and human ratings have not been collected.
Inventory is simulated. No public hosting, independent user outcomes or successful
complete live journey is claimed. See [validation history](VALIDATION.md).

The default durable cap is 60 provider attempts per UTC day, including failures.
Vercel deployment requires shared Redis storage. Local/Docker deployment requires
one process and persistent runtime storage.
For the final submission, supply working public demo/repository links and keep
judge access available through the judging period under the
[official rules](https://qloo.devpost.com/rules).
