# Reuse and provenance

ShelfBridge was created on 4 October 2026. All source code in this directory was
written for this application; no donor source files were copied.

Design ideas from the owner's existing portfolio:
- VoiceOps: evidence references and failure-state honesty.
- Latch Agent: deterministic policy outside the model.
- CoreJam Keeper: confirmed correction followed by a new decision.
- Wiggle Room: a compact, bounded set of choices.
- OpenBB/Fogo: decision cards and a visible before/after.

No code was copied from projects lacking a root LICENSE or from AGPL projects.
The live transport executes the official MIT-licensed `@qloo/qloo-harness`
0.1.26 as an installed dependency; its source is not copied into ShelfBridge's
application modules. Preserve the harness package's LICENSE and third-party
notices in distribution. The ignored development `.tools` also contains Node
and Playwright with their original notices. Fixture mode has no package runtime
dependencies; the Docker image now includes the pinned live CLI dependency.
The cover designs are original HTML/CSS typography, not publisher cover scans.
Book titles and author names identify real works. Prices, demo formats, stock,
SKUs and the inventory snapshot are simulation data. The short notes are original
descriptions, not quoted jacket copy. Qloo response dumps are not committed.
