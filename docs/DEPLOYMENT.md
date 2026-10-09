# Publish the complete ShelfBridge application on Vercel

Published 9 October 2026: [ShelfBridge](https://shelfbridge.vercel.app).
Primary mode: **Qloo-only**, with no built-in LLM.
The browser UI and Node API run in one Vercel project. Shared state uses
**Upstash Redis**, connected through Vercel Marketplace. No separate VPS is
required. MCP remains a six-tool stdio interface on the agent's computer and
can call the published HTTPS API. The public HTTP journey passed eight checks
with five Qloo reservations and no OpenAI calls. See [validation](VALIDATION.md).
The `shelfbridge` Vercel project is connected to
`https://github.com/Seranov67/ShelfBridge`; the production branch is `main`.
Provider credentials remain in Vercel environment variables, separate from Git.

```text
Browser → Vercel HTTPS → static UI
                      → Node Function → Qloo CLI → Qloo API
                                      → Upstash Redis (sessions, call ledger)
Agent → local MCP stdio → same Vercel HTTPS API
```

## What changed for Vercel

Sessions are shared Redis records with a fixed 30-minute lifetime. A lease
prevents concurrent writers; saves check its owner so a stale Function cannot
overwrite another request. Search and decision attempts are saved before a
provider call, including failed attempts. Choices persist across Function
instances and cold starts. An abandoned lease expires after 60 seconds.

Qloo calls reserve against one atomic Redis ledger before the CLI runs. Its
day comes from Redis UTC time. A timeout is never retried or refunded. Lower
limits stay effective across warm instances for that day. The production
namespace must remain stable across redeployments. Browser and MCP sessions
share this ledger; neither loads an OpenAI key.

Local and Docker launches retain their original single-process file ledger.
They must not spend against the same Qloo key while the hosted app is active
unless all additional usage is accounted for. The migration command below
carries today's local verification spending into the hosted ledger.

The build creates `.vercel/output/static` with only three browser files and a
private Node 22 Function containing source, catalog and the pinned harness.
No credential or report is embedded. Qloo's temporary home uses `/tmp`; no
durable state relies on the Function filesystem. API responses are uncached.

## 1. Prepare the repository and verify Qloo

Repository: [Seranov67/ShelfBridge](https://github.com/Seranov67/ShelfBridge).
Keep `.env`, `.runtime`, `.tools`, `node_modules`, `.vercel` and `test-results`
out of Git. The MIT license and English instructions are included.

On a compatible Node **22.19+** workstation:

```sh
npm ci --ignore-scripts --no-audit --no-fund
cp .env.example .env
```

Configure the genuine Qloo key and organizer-approved endpoint in `.env`.
Run the offline doctor and the reviewed live controls from [QLOO-P00.md](QLOO-P00.md).
Do not set `QLOO_CONTRACT_APPROVED=true` to bypass failed controls.
After genuine current P00 evidence is available and contract approval is justified:

```sh
npm run smoke:qloo
npm run preflight:qloo
npm run enable:qloo
```

P00 can reserve thirteen attempts; HTTP smoke up to five. Failures count.
Stop the local application during these tools. Old HTTP evidence cannot activate
the changed source. Controlled tests cannot replace genuine live reports.

## 2. Import into Vercel and connect Redis

1. Import the GitHub repository into Vercel, with framework preset **Other** and
   repository root as Root Directory.
2. Select Node **22.x** in Project Settings. Keep the committed install/build
   commands: `npm ci --ignore-scripts --no-audit --no-fund` and
   `npm run build:vercel`. Leave Output Directory at its default; the build
   emits the Vercel Build Output API directly.
3. Add **Upstash Redis** from Storage / Marketplace and connect it to this
   project's Production environment. Use its HTTPS REST URL and write token.
   Check the resulting variable names against the table below.
4. Use the Production domain listed in Project Settings → Domains, currently
   `shelfbridge.vercel.app`. Set `PUBLIC_ORIGIN` to that exact HTTPS origin,
   with no trailing slash. The CLI may also display an alias containing the
   team slug; that service alias can require Vercel Authentication even while
   the project's Production domain is public. Verify the chosen domain without
   authentication before configuring it.

Set these **server-side Production environment variables**:

| Variable | Value |
| --- | --- |
| `SHELFBRIDGE_MODE` | `qloo_only` |
| `QLOO_API_KEY` | Actual Qloo key |
| `QLOO_BASE_URL` | Organizer-approved API origin |
| `QLOO_TRUSTED_BASE_URL` | Same reviewed API origin |
| `QLOO_CONTRACT_APPROVED` | `true` only after verified controls |
| `PUBLIC_ORIGIN` | `https://<project>.vercel.app` or exact custom origin |
| `UPSTASH_REDIS_REST_URL` | HTTPS origin ending in `.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Database REST write token |
| `SHELFBRIDGE_STATE_NAMESPACE` | Stable value, e.g. `production` |
| `DAILY_PROVIDER_CALL_LIMIT` | `60` |
| `MAX_SESSIONS` | `200` |
| `MAX_NEW_SESSIONS_PER_HOUR` | `200` |
| `SHELFBRIDGE_P00_REPORT` | Exact JSON from genuine `test-results/p00.json` |
| `SHELFBRIDGE_QLOO_SMOKE_REPORT` | Exact JSON from genuine current HTTP smoke |

The Function forces CLI transport, its bundled harness and secure cookies.
No OpenAI variable or separate backend URL is required. Missing configuration
or mismatched evidence returns a controlled 503; no fixture fallback is used.
The static build can succeed before activation, so a successful Vercel build
alone does not mean the application is ready for judges.

Do not share Production database credentials or namespace with Preview builds.
Previews need their own Redis state, configured origin and explicit credentials;
they are not automatically trusted by the Production backend.

## 3. Carry over today's verification usage and deploy

Add the same Redis variables and production namespace to the ignored local
`.env`. With the hosted API still inactive:

```sh
node scripts/redis-doctor.mjs
node scripts/redis-doctor.mjs --import-local-budget
```

The first command checks Redis and reads the ledger without provider requests.
The second imports `.runtime/budget.json` for the current UTC day, never lowering
existing reservations. Do not delete Redis state or change the namespace to
reset limits. Avoid overlapping local/cloud provider use during migration.
If the day differs, the import refuses; verify the current day's usage first.

Deploy or redeploy from Vercel after configuring the variables. Enable Fluid
compute and ensure the configured 60-second Function duration is supported.
The application provider deadline remains shorter. Configure Vercel request
rate limits and spending alerts. A 60-call daily cap is shared demo capacity,
not a monetary cap for Vercel, Redis or all uses of the Qloo key.

## 4. Verify the public application

From another network, test bootstrap, manually reviewed film/artist searches,
three eligible choices, confirmed exclusion, a lower budget, gift card and
reload. Check secure cookies, exact origin checks and uncached API responses.
Record actual reservations and latency; a completed normal journey can spend
five Qloo attempts. Check that a new Function instance restores the same choice.
The health endpoint checks application configuration/liveness; bootstrap also
exercises Redis. Neither health nor bootstrap makes a Qloo request.

Offline tests, local Redis and a packaged CLI check do not establish Vercel's
deployed behavior. Validate the real Function runtime and Qloo connection before
submitting. Keep the demo functional throughout judging; no always-running LLM
or personal workstation is required for browser access.

## 5. Connect the preserved MCP tools

On the agent's computer, with this project revision installed:

```sh
node scripts/mcp-server.mjs --remote https://<project>.vercel.app
```

Configure this command as the agent's MCP stdio process. Remote mode is explicit
and accepts only exact HTTPS `*.vercel.app` origins, with no path, credentials
or redirects. Use the stable Vercel alias even if the browser uses a custom
domain. No provider or Redis key is passed to the agent. Default loopback mode
and `--base http://127.0.0.1:4318` remain available for local use.
See [AGENT-MCP.md](AGENT-MCP.md). The agent needs its own model access when used;
the ordinary browser flow does not. A real external agent walkthrough remains
separate from controlled MCP protocol tests.

Official references: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js),
[Build Output Functions](https://vercel.com/docs/build-output-api/primitives),
[Upstash on Vercel](https://vercel.com/marketplace/upstash),
[Redis REST API](https://upstash.com/docs/redis/features/restapi),
[atomic Lua commands](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval).
