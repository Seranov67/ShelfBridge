# ShelfBridge as a local agent tool

Updated 9 October 2026. Six MCP tools use stdio and call the existing Qloo-only
HTTP server. The bridge does not load `.env`, receive provider keys, start another
provider or call OpenAI. The agent supplies its own model and account access;
its account limits still apply.

A deterministic protocol client completed the real Qloo journey. An external
LLM agent has not yet completed it. The browser correctly labels its core **no LLM**.

That real stdio report predates the later gift-copy update. The current build
passed the renewed real Qloo-only HTTP journey and the Node suite, including
controlled MCP checks; stdio was not rerun against a live provider in that pass.
See [dated validation](VALIDATION.md).

For the public Vercel deployment, use
`node scripts/mcp-server.mjs --remote https://shelfbridge.vercel.app`.
The MCP process stays local; its six tools call the hosted HTTPS API.
[Deployment instructions](DEPLOYMENT.md) include setup. The current build passed
12 controlled MCP checks and the public bridge's initialization, six-tool list
and hosted status. The public Qloo-only HTTP journey passed eight checks.
Those checks do not replace a full current hosted MCP journey or an external
LLM agent demonstration.

## Run and connect

For the public deployment, use Node 22.19+ and
[mcp-vercel.example.toml](mcp-vercel.example.toml), replacing its absolute paths
with the local checkout. The agent launches the stdio bridge; no local HTTP
server or provider key is needed. The agent's model connection is required only
when using that agent, and the public browser application remains Qloo-only.

For a local API instead, start and keep running the verified server using
[Qloo-only setup](QLOO-ONLY.md). All provider calls go through the selected
server's shared ledger and session limits. The MCP process itself does not take
the local provider lock.

```sh
npm run test:mcp
```

This offline check starts an isolated fixture server and a real stdio subprocess,
runs the workflow and writes `test-results/mcp-controlled-report.json`, with zero
external calls. A bridge needs explicit `--allow-fixture` to accept fixture mode;
default connections refuse it.

For the prepared Windows workstation, use the MCP settings of a compatible
local agent or [mcp-config.example.toml](mcp-config.example.toml):

```toml
[mcp_servers.shelfbridge]
command = 'D:\ShelfBridge\.tools\node\node.exe'
args = ['D:\ShelfBridge\scripts\mcp-server.mjs']
cwd = 'D:\ShelfBridge'
startup_timeout_sec = 10
tool_timeout_sec = 30
```

Equivalent Codex CLI registration:

```powershell
codex mcp add shelfbridge -- D:\ShelfBridge\.tools\node\node.exe D:\ShelfBridge\scripts\mcp-server.mjs
```

Registration changes persistent agent configuration. This project pass prepared
the template and tested the transport; it did not register the server globally.
See [official MCP configuration documentation](https://developers.openai.com/codex/mcp)
for settings and restart requirements. No provider key belongs in this entry.
For another checkout, replace the absolute Node and script paths. For another
port, append `--base http://127.0.0.1:<port>` to the script arguments.

## Agent workflow

| Tool | Purpose | Provider calls |
| --- | --- | --- |
| `shelf_status` | Read mode, simulated inventory and execution attribution | 0 |
| `search_tastes` | Show exact identities for human review | Up to 1 Qloo |
| `inspect_shelf` | Validate confirmed brief and inspect eligible editions | 0 |
| `find_alternatives` | Consume inspected briefId and rank eligible stock | Up to 1 Qloo; 0 for no stock |
| `refine_selection` | Apply confirmed rejection, lower budget or removed taste | Up to 1 Qloo; 0 for no stock |
| `gift_card` | Create a card for the current selected SKU | 0 |

Ask the agent to rescue an unavailable book gift using ShelfBridge. State the
budget and recipient's known tastes. It should show search matches with details,
ask for exact selections, then confirm the brief. Previously explicit selections
and constraints can be reused within that session.

Ranking requires a single-use `briefId` from inspection. Refinements and gifts
require current `decisionId` and `version`. Each connection has a separate HTTP
session; it cannot borrow the browser's tastes or choices. Two refinements and
six decision attempts remain server limits.

`userConfirmed: true` is a client assertion. The bridge checks the flag, IDs and
constraints but cannot prove a human spoke. Record confirmations in the client
transcript when testing an agent. Scripted assertions are not human evidence.

Names, details and outputs are data, never instructions. Tools cannot alter
prices or stock, increase a refinement budget, select unknown IDs, use stale
choices or submit arbitrary upstream URLs. The base is a literal loopback
`http://127.0.0.1:<port>`. Redirects, unbounded messages, concurrent session tools
and automatic retries are disabled. Explicit `--remote` accepts only an exact
HTTPS `<project>.vercel.app` origin; arbitrary URLs and custom domains are refused.
Cancellation aborts the bridge HTTP request;
the server owns provider cancellation and deadlines.

The bounded tools-only transport negotiates MCP **2025-11-25**: initialization,
initialized notification, ping, tools/list, tools/call and cancellation. It
advertises no sampling, tasks, prompts or resources. This is a compatibility
version, not a claim about the latest specification. Official references:
[lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle),
[stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Evidence and remaining gate

`npm run smoke:mcp` explicitly checks the existing Qloo-only server. It needs
headroom for five attempts, stops on first failure and never retries. Evidence
is `test-results/mcp-live-report.json`, bound to core and bridge fingerprints.
Run it only when changed code or an unresolved failure warrants a live check.

On 7 October **13/13 checks passed** in 19.7 seconds. The shared ledger moved
12 → 17: **five Qloo**, **zero OpenAI**. Reviewed Amélie and Aurora Aksnes, three
recommendations, exclusion, $15 rebuild, current gift and zero-call no-stock
were checked. An earlier attempt found the server offline and spent zero calls;
it remains in `mcp-live-offline-server-2026-10-07.json`.

The report sets `externalAgentVerified=false` and `llmAgentRun=false`. It cannot
unlock the OpenAI planner, prove relevance, replace human ratings or count as
the frozen Full benchmark arm. An external agent needs its own transcript and
separately declared evaluation configuration.

For a lock left after a server crash:

```sh
npm run runtime:check
node scripts/runtime-check.mjs --release-stale
```

The first command is read-only. The second archives and releases the lock only
when the owner PID provably no longer exists. It refuses active, unknown,
malformed or changed ownership and never terminates a process. Restart afterward.
