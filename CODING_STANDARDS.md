# Coding standards

Read by the **review** stage, not the implementation stage. Only judgement calls live here; anything a tool or test can enforce belongs in `npm run check`.

- **Ticket scope is strict**: implement exactly the ticket's acceptance criteria. Extra UI, buttons, or messages no ticket asked for is scope creep — flag it.
- **Thin-glue tolerance**: in DOM/event glue — including repeated declarative markup such as button or option lists — a shape repeated up to twice is fine; extract a helper or a config-driven render on the third occurrence, not the second.
- **Names state real scope**: a predicate named `isUrl` must accept every URL form it implies; otherwise name the narrower truth (`isHttpUrl`).
- **Independent test values**: expected values in the pure-seam tests come from a worked example or the spec's literal matrix, never from recomputing the implementation's own formula.
- **Pure seams stay pure**: keep `parse` / `query` / `format` / `order` / `search-text` / `address` side-effect free and tested; UI and IndexedDB are thin glue verified by hand (see `CLAUDE.md`).
- **A term is never another term's `_Avoid_`**: when a word names the feature (in the spec, a ticket, or shipped UI), give it its own `GLOSSARY.md` entry and scope its `_Avoid_` to misuse. A word that appears in another entry's `_Avoid_` *and* in shipped UI is a contradiction — flag it.
- **Two axes, two verdicts**: a review missing one axis's verdict (a sub-agent died, an axis was skipped) is not a review. Re-run the missing axis before closing; don't report a single-axis conclusion as the review.
