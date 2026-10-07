# Implementation decisions · 4 October 2026

- **Build authorization:** the owner explicitly selected implementation of
  ShelfBridge, superseding the earlier wait-until-after-AMD instruction.
- **P00 remains OPEN:** the Qloo key is absent. Independent policy/UI implementation
  proceeds in fixture mode; this does not override the live feasibility or release
  gates. The live adapter is locked behind an explicit contract approval flag.
- **JavaScript ESM instead of planned TypeScript:** Node 22, zero runtime dependencies,
  small modules and executable boundary validation avoid a bundler/install step.
  This is a scoped implementation choice, not a claim of static type checking.
- **One deterministic fact owner:** catalog policy chooses stock, currency, cheapest
  eligible SKU and exact price. Neither the LLM nor Qloo may override those facts.
- **Taste ownership:** the giver's unavailable choice is not automatically a
  recipient preference. Only explicitly confirmed search identities become signals.
- **Bounded agent:** Responses function tools inspect_shelf then rank_shelf. Primary
  taste focusing requires explicit user selection. No unconstrained planning,
  external URLs, autonomous purchases or invented evidence are permitted.
- **Explanation scope:** source/rank/input signals and catalog facts are rendered
  with controlled templates. No causal graph edge, probability of liking, plot
  interpretation or unverified model prose is asserted.
- **Teaching mode:** hand-authored thematic fixture sorting, visibly distinct from
  Qloo. No hidden substitution on API error. Fixtures are not contest evidence.
- **Sessions:** random HttpOnly capability cookies; exact decision version checked
  on refinements; concurrent mutations rejected; all provider outcomes commit only
  after successful validation. Editing a brief starts a fresh set of exclusions.
- **Budget:** durable before-call reservations, one process, persistent volume,
  global daily call limit, bounded token output and per-session limits. A provider
  currency billing cap is a release requirement; it is not yet configured.
- **Visuals:** original typographic covers. No downloaded jacket art or publisher
  assets. No third-party fonts or browser tracking.
- **Decision identity:** a newly started brief has version 1; refinements and gift
  choices must match both the current decision UUID and version. Old tabs cannot
  reuse version 1 from a different brief. There is no shared team editing or durable
  customer history.

Release requires live Qloo, verified entity mapping, judging availability,
external deployment, fairness-reviewed benchmark, user outcomes and licensing.
