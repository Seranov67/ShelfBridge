# ShelfBridge — English demo

## Current recording

The local recording is a 1 minute 42 second captioned fixture walkthrough with no audio:
`test-results/demo/shelfbridge-fixture-demo.webm`.
It shows the real interface and interactions on an isolated local server.
The persistent caption bar identifies teaching data and simulated inventory.

This walkthrough makes no external provider calls. Real Qloo controls have passed
separately; the complete Qloo + OpenAI journey is not yet verified.
The public Qloo-only application is verified at
[shelfbridge.vercel.app](https://shelfbridge.vercel.app). A final live submission
video still needs recording; the existing fixture video is not live evidence.

## Hosted Qloo-only recording plan

Record the public domain and keep **Live Qloo · no LLM · demo inventory** visible.
The target is approximately two minutes; this is a presentation choice.

| Time | Screen action | English narration |
| --- | --- | --- |
| 0–15 s | Public home page and mode badge | When the first-choice gift is unavailable, ShelfBridge preserves the thought behind it. This demo uses real Qloo and a deterministic workflow, with no LLM. |
| 15–40 s | Try a gift rescue; select Amélie (2001), then search and select Aurora Aksnes | We confirm the exact film and artist identities, then review the unavailable book and the $25 budget. |
| 40–60 s | Find the thoughtful alternative; show three cards | Qloo ranks only the eligible demo shelf. Server policy enforces prices, stock and the confirmed budget. |
| 60–80 s | Exclude one title and confirm the rebuild | Already owned? Confirm the exclusion. Every edition of that work is removed. |
| 80–100 s | Lower the budget to $15 and confirm | The new shortlist stays within the lower budget. |
| 100–115 s | Open evidence, then choose a gift | The source and confirmed signals are traceable. The gift card keeps the selected description and a draft note. |
| 115–125 s | Reload, showing the preserved selection | Redis preserves the session across requests. Inventory is simulated; no purchase or reservation is made. |

Use the actual returned titles rather than promising a fixed ranking. One
successful take spends five Qloo attempts; failures count and repeated takes
share the operator's 60-attempt daily limit. An optional MCP clip can show the
six tools and hosted status without claiming an external LLM run that was not
performed. Do not display environment-variable values or provider keys.

## Storyboard and English narration

The target is approximately 100–120 seconds, including interaction time.
This is a presentation choice, not an official competition duration requirement.
The recording burns these English captions into the picture, so audio is optional.

| Scene | Action | Caption / optional narration |
| --- | --- | --- |
| 1 | Show the home page | ShelfBridge helps you find a thoughtful gift when your first-choice book is unavailable. |
| 2 | Try a gift rescue; review the brief | Start with the recipient's confirmed films and music, an unavailable book, and a $25 budget. |
| 3 | Generate alternatives | The shortlist stays within the available shelf and budget. Prices and stock are simulated. |
| 4 | Exclude the first title; show confirmation and rebuild | Already owned? Confirm the exclusion. Every edition of that book leaves the eligible shelf. |
| 5 | Lower the budget to $15; confirm and rebuild | Lower the maximum to $15. The system rebuilds the selection without raising your budget. |
| 6 | Open the evidence panel | Inspect the source, tastes, shelf boundary and decision trail. This recording uses fixture data. |
| 7 | Choose a gift and show the card | Choose a book and keep a gift note. No purchase or reservation is made. |
| 8 | Close the card and show the final selection | Real Qloo controls passed separately. The complete Qloo + OpenAI journey still needs verification. |

## Reproduce the recording

The app itself needs no browser package. Recording uses Playwright as a development
dependency, plus an installed Chrome/Chromium and Playwright's video encoder.
Use an existing development installation where available.

```sh
npm run demo:record
```

On the prepared Windows workstation:

```powershell
$env:PLAYWRIGHT_PACKAGE_PATH = 'D:\ShelfBridge\.tools\runtime\node_modules\playwright'
$env:BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/record-demo.mjs
```

If Playwright is unavailable, install it in a development environment and install
its Chromium/video runtime. An environment with working browser acceptance checks
already has the Playwright package and browser; video recording additionally
requires its ffmpeg runtime.

The recorder always creates its own fixture server on an ephemeral loopback port.
It does not load credentials, change the running app or modify the daily provider
ledger. It validates exclusion, budget, source labels and gift completion, and
saves `recording-report.json` plus preview images beside the video. Re-running
overwrites the named local video. Generated media is ignored by Git.

## Final live submission recording

The local app now has a verified real Qloo-only workflow, described in
[QLOO-ONLY.md](QLOO-ONLY.md). The existing recording remains a fixture walkthrough.
A Qloo-only recording must show manual taste confirmation and the no-LLM label;
it cannot be narrated as a successful OpenAI tool loop.

For this primary Qloo-only release, the public HTTP smoke has passed and no
OpenAI planner is required. Record the verified public build using manual cultural identity
confirmation: search Amélie and Aurora Aksnes and select the correct matches.
Show genuine source and agent labels. Keep the simulated-inventory disclosure.

Replace fixture narration with the verified live behavior only after observing
it. Record the actual ranking rather than promising specific titles. Update
README, project description and judging instructions to match the submitted
build. Include working public links; localhost is not a remote demo URL.

Submission materials must be English or have English translations under the
[official Qloo rules](https://qloo.devpost.com/rules).
