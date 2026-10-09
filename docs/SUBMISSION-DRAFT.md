# ShelfBridge — A different book. The same thoughtfulness.

Preparation draft, updated 9 October 2026. Qloo-only is the primary mode;
OpenAI access is not needed for this release. The public demo is
[shelfbridge.vercel.app](https://shelfbridge.vercel.app). Current real Qloo controls
and both local and public deterministic Qloo-only HTTP journeys passed on
9 October. Prepared source commits still need publication to the designated
repository; see [validation](VALIDATION.md) for publication status.
The MCP tool interface passed a real Qloo protocol check; an external LLM agent
run remains unverified. Review the status before submitting.

## Tagline

Turn the recipient's films, music and books into a thoughtful gift that fits the
available shelf and budget.

## Inspiration

A gift buyer has a book in mind, but it is out of stock. The challenge is to
preserve the thought behind that gift while finding something the bookstore can
actually offer. A broad recommendation list does not account for that shelf, the
price of a specific edition or a title the recipient already owns.

## What it does

ShelfBridge turns a gift brief into up to three eligible alternatives. The buyer
sets a budget, identifies an unavailable original choice and confirms exact
matches for the recipient's films, artists or books.

The server filters inventory before ranking. Each work uses its cheapest eligible
edition. The buyer can exclude an owned title, lower the budget or remove a taste,
confirm two refinements and compare the selections. Choosing a book opens a gift
card that can be copied or printed; no order or reservation is made.

The prototype has 30 book works and 31 SKUs with simulated prices and stock.
It has not been connected to a partner bookstore's inventory.

## How we built it

The application uses vanilla HTML/CSS/JavaScript and a Node.js server. Policy code
owns identities, prices, quantities, editions, exclusions and budgets. Vercel
serves the UI and Node Function; Upstash Redis shares sessions and atomic daily
provider quotas across Function instances.

The primary mode uses real Qloo with deterministic server orchestration
and no LLM. A bounded OpenAI Responses planner is implemented as a separate,
unverified mode and is not used by the public release.

Six local MCP tools expose identity search, constrained shelf inspection,
ranking, confirmed refinements and current gift selection to an existing agent.
They reuse the same server and provider budget without calling the OpenAI API.
A scripted stdio client passed the real Qloo journey; this is transport evidence,
not an external LLM agent demonstration or measured relevance improvement.

The official Qloo harness 0.1.26 supplies cultural searches and book rankings,
restricted to the eligible shelf. Confirmed signals are retained unless the buyer
explicitly permits a primary-taste query. Providers cannot change inventory facts
or constraints.

The evidence panel shows source, signals, shelf boundary, returned and omitted
coverage, a decision reference and tool trace. Affinity is not described as a
probability of liking. Fixture mode offers a labeled deterministic walkthrough.

## Challenges we ran into

Exact identities matter. A search for AURORA returned an ambiguous artist record;
its external MusicBrainz identity exposed the mismatch. Aurora Aksnes produced
the reviewed Norwegian singer. We also selected the first Hitchhiker's Guide
novel rather than a higher-listed omnibus.

Preserving constraints across changes is another challenge. Exclusions remove
every edition of a work, a lower budget cannot be raised by a provider, and stale
briefs pause gift selection until the current state is loaded.

The experimental OpenAI planner journey has not passed because its API credits
were exhausted. It is outside the primary Qloo-only release. Live errors are
surfaced without silently substituting fixture results.

## What we have verified

- Real Qloo identity review: 29/30 works, including all 26 eligible works.
- Real Qloo controls: 13/13 passed, including disjoint shelves, an exclusion
  control and 10/10 nonempty taste profiles.
- Real Qloo-only journey: eight HTTP checks with five Qloo calls and zero OpenAI,
  including confirmed tastes, exclusions, lower budget, gift and no-stock handling.
- Current local checks: 134/134 Node tests, 12/12 controlled MCP checks and
  27/27 fixture browser scenarios through two Function handlers sharing real
  local Redis, covering constraints,
  session recovery, keyboard use and mobile layouts.
- Historical controlled Qloo-only browser checks: 10/10 passed on 7 October.
- Public Vercel HTTP journey: 8/8 passed with five Qloo reservations, secure
  cookies, no-store API responses and restored Redis session state.
- Public browser search returned the reviewed Amélie (2001) match. Remote MCP
  initialization, six-tool list and hosted status passed without provider calls.
- A separate local English fixture recording; the final hosted video is pending.
- Docker and complete Vercel build checks passed; credentials and activation
  evidence are configured server-side and remain outside Git.

Codex reviewed identities using real metadata; independent human review is not
claimed. Tests do not establish recommendation relevance. No satisfaction, sales
impact or benchmark lift has been measured. The live Qloo + OpenAI session is
not yet verified.

## What we learned

A useful shortlist needs precise identities and practical constraints as well as
cultural ranking. Showing the source and inventory facts helps a buyer understand
what the system has established and what remains a hypothesis.

## What's next

Publish the prepared source to the designated open-source repository, record
the verified public Qloo-only demo, demonstrate MCP in an existing agent, and collect independent
gift-buyer and bookseller feedback. See [deployment instructions](DEPLOYMENT.md).
A planned B0/B1/B2/Full comparison will examine whether the bounded agent adds
value over deterministic ordering and direct Qloo ranking.

## Built with

JavaScript, Node.js, HTML, CSS, Qloo Taste AI, Qloo harness 0.1.26, MCP,
Vercel and Upstash Redis.
Playwright is used for development checks and demo recording. An optional
experimental mode implements the OpenAI Responses API.

## Links and testing materials

- Local prototype: http://127.0.0.1:4318/ (not accessible to remote judges).
- [Public live demo](https://shelfbridge.vercel.app).
- [Designated source repository](https://github.com/Seranov67/ShelfBridge);
  current source synchronization is pending. The project license is MIT.
- [English judging instructions](JUDGING.md).
- [English demo script and captions](DEMO.md).

Before submitting, replace pending links with verified public URLs, record the
verified live build and update the evidence. The
[official rules](https://qloo.devpost.com/rules) require a functional demo link,
a public open-source repository, a project description and English submission
materials or translations. Access must remain available through judging.
Human research and benchmark comparisons are our validation goals, not additional
competition entry requirements.
