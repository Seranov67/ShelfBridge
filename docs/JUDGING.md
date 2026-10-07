# ShelfBridge — Setup and testing instructions

Updated 7 October 2026. This document describes the current local prototype.
A public live demo and repository have not yet been published.

## Choose the correct mode

**Fixture:** available now, uses teaching data and a deterministic workflow.
No Qloo or OpenAI calls are made. The interface says
**Teaching demo · Qloo offline**.

**Qloo-only:** available and active on the prepared workstation. Real Qloo
searches and rankings use a deterministic server workflow, with no OpenAI calls.
The badge says **Live Qloo · no LLM · demo inventory**. The complete HTTP journey
passed eight checks with five Qloo calls and zero OpenAI. Follow
[Qloo-only setup and testing](QLOO-ONLY.md) for manual taste confirmation.

**Live:** the Qloo CLI and its 13 controls passed. The full Qloo + OpenAI journey
has not passed because OpenAI API credits are exhausted. Do not treat the fixture
walkthrough or recording as evidence of a working live agent.

**MCP agent tool:** six tools connect an existing agent to the Qloo-only server.
The real stdio protocol journey passed 13 checks with five Qloo calls and zero
OpenAI. The client was scripted; an external LLM agent run is still unverified.
See [connection and testing instructions](AGENT-MCP.md).

## Local setup without keys

1. Obtain the project source and install Node.js 22 or newer.
2. Open a terminal in the project directory.
3. Ensure `SHELFBRIDGE_MODE` is unset or `fixture` in the shell.
4. Run `node src/server.mjs`. No package installation is needed for fixture mode.
5. Open http://127.0.0.1:4318/ and verify the fixture badge.

The command does not load a local `.env`; `npm start` does. Both inherit shell
variables. No login or customer details are needed. If port 4318 is occupied,
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

After restoring OpenAI credits and daily headroom, run planner smoke, full live
smoke, preflight and enable:live in that order. Stop on failure. Judges should
use the hosted live build after the operator verifies it; they should not need
to supply their own API credentials.

In a verified live session, search Amélie as a film and Aurora Aksnes as an artist,
inspect disambiguation and explicitly select the correct identities. The
unavailable book is an exclusion, not an implied taste. Keep the primary-taste
selector empty for the all-confirmed flow.

The evidence panel must show Live Qloo Taste Graph and LLM tool loop. Actual
rankings may differ from fixture ordering. Empty rankings and provider errors
must be reported honestly.

## Current evidence and limits

Real Qloo: 13/13 controls and 10/10 nonempty profiles.
Local evidence as of 7 October: 119/119 Node tests, 23/23 fixture browser checks,
9/9 controlled Qloo-only browser checks and 7/7 questionnaire browser checks.
Qloo-only has separate real HTTP evidence; the two-provider journey is unverified.
Benchmark collection tooling is prepared;
real comparison outcomes and human ratings have not been collected.
Inventory is simulated. No public hosting, independent user outcomes or successful
complete live journey is claimed. See [validation history](VALIDATION.md).

The default durable cap is 60 provider attempts per UTC day, including failures.
The current single-process deployment design requires persistent runtime storage.
For the final submission, supply working public demo/repository links and keep
judge access available through the judging period under the
[official rules](https://qloo.devpost.com/rules).
