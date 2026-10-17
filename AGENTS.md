<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI/UX rules are mandatory

Before any UI design or modification, read `DESIGN.md` in this directory and follow it: design tokens, typography/spacing scales, component reuse, accessibility floors, and the anti-pattern blacklist. Existing screens are evolved, never redesigned wholesale; never touch business logic, APIs, or data structures for UI work.

Two project skills support this (installed under `.zcode/skills/`):

- `ui-ux-pro-max` (+ `design-system`, `ui-styling`, `brand`, `design`, `slides`, `banner-design`): searchable design intelligence. CLI usage is documented in DESIGN.md §11 (run with `python`, not `python3`, on Windows).
- `impeccable`: design critique/refinement. Deterministic checks run via `.zcode/skills/impeccable/scripts/bin/windows-x64/impeccable.exe detect <url-or-file>`; command reference in `.zcode/skills/impeccable/SKILL.md` and `reference/`. Auxiliary agents live in `.zcode/agents/`.

Every UI change must pass the workflow in DESIGN.md §11 (plan → implement → impeccable detect → browser screenshot verification → typecheck/lint/test).
