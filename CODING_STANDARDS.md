# Coding standards

Read by the **review** stage, not the implementation stage. Only judgement calls live here; anything a tool or test can enforce belongs in `npm run check`.

- **Ticket scope is strict**: implement exactly the ticket's acceptance criteria. Extra UI, buttons, or messages no ticket asked for is scope creep — flag it.
- **Thin-glue tolerance**: in DOM/event glue, a shape repeated up to twice is fine; extract a helper on the third occurrence, not the second.
- **Names state real scope**: a predicate named `isUrl` must accept every URL form it implies; otherwise name the narrower truth (`isHttpUrl`).
- **Independent test values**: expected values in parse/query tests come from a worked example or the spec's literal matrix, never from recomputing the implementation's own formula.
- **Pure seams stay pure**: keep `parse` / `query` side-effect free and tested; UI and IndexedDB are thin glue verified by hand (see `CLAUDE.md`).
