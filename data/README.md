# Live catalog mapping

There are no invented Qloo IDs in this repository. Create a local `qloo-mapping.json`
after reviewing real search results. Format: an object mapping each local `workKey`
to a confirmed Qloo UUID, e.g. the title and author must refer to the same work.
Never fill this file with fixture IDs. Do not automatically pick the first search match.

Copy `qloo-review.example.json` to a local `qloo-review.json` and review the actual
identities. Keep unresolved IDs null and `identityReviewed=false`. Once all
eligible books and the 10 taste profiles are explicitly reviewed, run
`npm run mapping:compile -- data/qloo-review.json`. The compiler checks title/author,
expected taste type, UUIDs, duplicates, cross-profile consistency and complete
eligible-shelf coverage before writing `qloo-mapping.json` and `qloo-profiles.json`.
It does not verify the live response contract or set its approval flag.

The default live adapter uses the supported `qloo api` CLI. Pinned harness
0.1.26 returns entity arrays for search and insights; the adapter wraps them for
the shared strict parser. This shape was checked against the actual CLI with a
controlled local upstream, but still needs real positive and negative controls.
`QLOO_CONTRACT_APPROVED` must remain false until those controls pass. Catalog
work keys are not Qloo IDs. Edition/SKU prices and quantities are locally authored
simulation data.

Current event access instructions: [Qloo hackathon kit](https://github.com/qloo/qloo-hackathon-kit).
The supported CLI adapter is ready for a real issued credential; the previous HTTP
adapter remains an explicit legacy option. See [CLI setup](../docs/QLOO-CLI.md)
and [live readiness](../docs/LIVE-READINESS.md).

Prepare P00 with `npm run qloo:p00 -- plan data/qloo-review.json`; replay minimal
local captures with `npm run qloo:p00 -- replay data/qloo-review.json <captures.json>`.
The plan and replay commands never call Qloo or approve its contract. After
reviewing identities and configuring access, `npm run qloo:p00 -- live
data/qloo-review.json` collects bounded real evidence. Full capture instructions:
[P00 preparation](../docs/QLOO-P00.md).
