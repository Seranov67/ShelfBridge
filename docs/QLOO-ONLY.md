# Real Qloo without an OpenAI planner

Updated 7 October 2026. The local workstation is configured as `qloo_only`.
The interface says **Live Qloo · no LLM · demo inventory**.

This mode uses the reviewed Qloo identities and the supported CLI transport for
real searches and rankings. The server deterministically inspects eligible stock,
applies the user-confirmed taste strategy and requests a Qloo ranking. Prices,
stock, exclusions, budget and selection versions remain server-owned. No OpenAI
key, Responses request or LLM output is needed. Provider failures remain visible
and never produce teaching-data substitutions.

## Configure and activate

Use Node 22.19+, the supported Qloo harness, reviewed mapping, a working Qloo key
and current successful P00 controls. Keep credentials in the ignored local `.env`.
Stop any running ShelfBridge server, then execute:

```sh
npm run smoke:qloo
npm run preflight:qloo
npm run enable:qloo
npm start
```

Stop if a command fails. The smoke needs headroom for five Qloo reservations in
the shared daily ledger: two reviewed taste searches and three decisions.
Activation makes zero provider calls and changes only `SHELFBRIDGE_MODE`.
The application also checks the evidence on startup; changing server code or
reviewed identities requires fresh Qloo-only evidence. A concurrent server or
collector cannot share the runtime lock.

On the prepared Windows workstation, the equivalent startup command is:

```powershell
.\.tools\node\node.exe --env-file-if-exists=.env src/server.mjs
```

The configured CLI deadline in this mode is 18 seconds, allowing time to start
the local harness. Search and decision HTTP deadlines remain 20 seconds. The
two-provider mode retains its existing 7-second CLI deadline and 20-second total
decision deadline. Daily limits are unchanged; failed attempts still count.

## Try the real workflow

1. Open the local app and confirm its Qloo/no-LLM badge.
2. Click **Try a gift rescue**, review the Amélie film matches and select the
   recipient's exact identity. Live tastes are never preselected.
3. Select artist search, enter **Aurora Aksnes**, and choose the reviewed singer.
4. Keep the unavailable book and $25 maximum; confirm the brief.
5. Exclude a recommended book, confirm, then lower the maximum to $15 and confirm.
6. Inspect **Why these choices?**: real Qloo source, **Deterministic workflow ·
   no LLM**, confirmed tastes and the shelf boundary.
7. Choose a gift. Its card retains the real source and simulated inventory notice.

An optional primary taste still needs explicit selection. A no-stock brief spends
zero ranking calls. Reload restores the session without a provider call. The app
does not make purchases or reservations and does not collect customer identities.

## Verified evidence and limits

The real HTTP smoke passed all eight checks: bootstrap, reviewed searches,
initial decision, exclusion, $15 rebuild, gift card, session restore and zero-call
no-stock handling. It reserved five Qloo calls and zero OpenAI calls in 18.8
seconds overall on the earlier build. An earlier attempt hit the short search deadline; its failed
reservation and report were retained before the corrected run.

After adding book descriptions and the separate gift-note draft, the latest
real HTTP smoke passed 8/8 in 21.05 seconds with five Qloo calls and zero OpenAI.
The latest local verification passed 119 Node tests, 27 fixture browser checks
and 10 controlled Qloo-only browser checks. Controlled browser outcomes are not
real provider evidence. The 320 px result and gift-card screenshots were inspected;
copied text was checked inside isolated Chrome. [Validation history](VALIDATION.md).

Ignored evidence: `qloo-only-smoke.json`,
`qloo-only-smoke-first-timeout-2026-10-07.json`, `preflight-qloo-only.json`,
`qloo-only-tests-2026-10-07.txt`, `qloo-only-browser-report.json` and
`qloo-only-controlled-mobile.png`. The successful report is bound to the current
server fingerprint and reviewed P00 plan.

The Qloo-only report has `qlooOnlyEndToEndVerified=true` and
`liveEndToEndVerified=false`. It cannot activate the Qloo + OpenAI mode or be
counted as a successful LLM comparison. The later [MCP tool pass](AGENT-MCP.md)
verified real Qloo over stdio, with no OpenAI. An external LLM agent run,
independent human ratings, public source and externally tested HTTPS hosting
remain open. The English recording still shows the offline fixture.

## Switch modes

For the offline teaching version, use `SHELFBRIDGE_MODE=fixture`. For the full
planner version, first restore OpenAI access, then pass `smoke:llm`, `smoke:live`
and `preflight:live` before `enable:live`. Stop the app before activation and restart
afterward. Changing mode invalidates browser sessions; refresh and confirm tastes
again. Qloo-only is an explicit choice, never an automatic fallback from an error.
