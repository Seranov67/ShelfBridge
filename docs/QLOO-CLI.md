# Supported Qloo CLI transport

ShelfBridge now has a `QlooCliProvider` for the official harness **0.1.26**.
Fixture mode still needs no dependencies. Live mode defaults to `QLOO_TRANSPORT=cli`.
The older HTTP adapter is available only with explicit `http_legacy`; it cannot
pass the event transport readiness check.

## Setup

Use Node 22.19+ for the harness. This workstation has an isolated, SHA-256-checked
official Node **22.23.3** at `.tools/node/node.exe`; the system Node was not changed.
The development harness is installed under `.tools/runtime/`, which is ignored by
Git and Docker. The bundled Playwright there is a development test dependency.

For a clean environment, install the pinned package locally:

```sh
npm install --prefix .tools/runtime --ignore-scripts --no-audit --no-fund @qloo/qloo-harness@0.1.26
npm run qloo:doctor
npm run test:cli
```

On a host with another package location, set server environment variables:

```text
QLOO_NODE_PATH=/absolute/path/to/node
QLOO_CLI_ENTRY=/absolute/path/to/@qloo/qloo-harness/dist/bin.js
QLOO_TRANSPORT=cli
```

The Dockerfile installs the same pinned harness and sets its entry path. Its
container build has not been verified on this workstation; Docker is unavailable.
Keep the existing persistent `.runtime` volume and one process/replica.

`qloo:doctor` checks versions and runs a ranking **dry-run**, forwarding an explicit
offline placeholder rather than a real credential. The pinned CLI requires a key
even for dry-run. This command reserves zero calls and cannot prove live access.
`test:cli` launches the actual pinned harness against a loopback-only controlled
API and checks search, exact shelf parameters and rejection of an outside entity.
It also reserves zero real provider calls. Its report says `liveQlooVerified=false`.

## Verified local contract

Inspecting the published package and running its real process against the local
test server established that `qloo api search --json` and `qloo api insights --json`
in version 0.1.26 return **entity arrays**. The CLI extracts entities from the raw
HTTP envelope. It does not retain the whole `results.entities` envelope that the
old HTTP adapter consumes. The supported adapter explicitly wraps this array for
our shared strict parser; it does not accept arbitrary workflow envelopes.

Ranking uses `api insights --type book --take N --params JSON --json`, with only
server-owned, reviewed taste IDs and `filter.results.entities`. We never use
`--signal-query`, a natural-language resolver, guessed UUIDs or automatic top-match
selection. Search uses the requested type, query and a limit of five.

The [official kit](https://github.com/qloo/qloo-hackathon-kit) documents CLI/MCP as
supported event surfaces. **Real event-key compatibility is still unverified.**
The adapter defaults to the harness's official endpoint; an organizer-approved
gateway must be configured explicitly using `QLOO_BASE_URL` and the exact
`QLOO_TRUSTED_BASE_URL`. There is no automatic endpoint/credential fallback.

## Limits and evidence

- One shell-free Node child per provider call, hidden on Windows.
- Only Qloo's credential/gateway and basic OS variables are forwarded; OpenAI and
  unrelated cloud secrets are excluded. Keys never appear in process arguments.
- Same durable `DailyBudget` reservation before a call, including failures;
  no automatic retry. A seven-second process deadline includes startup and HTTP.
- Preloaded fetch guard prohibits redirects and limits upstream bodies to
  1,000,000 bytes; stdout/stderr together have the same cap. The child has a
  128 MiB V8 old-space limit. Aborted/stalled children are terminated.
- Contract validation rejects duplicate UUIDs, out-of-shelf works and malformed
  entities. No fixture substitution on failure; raw provider error prose is hidden.

After reviewed identities and credential setup, stop the application and run:

```sh
npm run qloo:p00 -- live data/qloo-review.json
```

This is an explicit live command: at most 13 ranking calls, a 120-second overall
deadline, shared runtime lock and ledger, stop on the first transport/contract
failure. No OpenAI calls. It dynamically builds exclusion from the actual first
shelf result and writes only sanitized `test-results/p00.json`. It does not set
`QLOO_CONTRACT_APPROVED=true`. The operator must review identity and evidence
before approving the application contract and then run the full Qloo/LLM flow.

On 6 October 2026, the event credential and organizer-provided hackathon endpoint
were configured in the ignored local `.env`. A bounded CLI search for `Piranesi`
passed against `https://hackathon.api.qloo.com`, returning two book candidates.
The initial sanitized evidence is `test-results/qloo-access-check.json`.
Subsequently 29/30 work identities and all ten profiles were reviewed, the mapping
compiled, and all 13 live P00 controls passed (`test-results/p00.json`). All 26
eligible works are mapped; the unmatched `priory` work has zero stock.
Earlier sandboxed attempts were blocked by network permissions. No OpenAI calls
were made during the Qloo checks. Contract approval was set after the passed
current P00; fixture mode remains active because the separate OpenAI smoke still
reports exhausted credits. Real end-to-end, human outcomes and hosting remain
open gates. See [current report](LIVE-ACCESS-2026-10-06.md).
