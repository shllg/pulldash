# Testing (`**/*.test.ts(x)`)

> **Load when:** adding or changing tests. Conventions come straight from `AGENTS.md`.

## Where & how

- **Data layer first.** Tests primarily exercise the data layer (`src/browser/contexts/**`,
  `src/api/**`); the frontend renders dumbly, so don't test through components what a hook/store
  test can cover directly (`02-data-layer.md`).
- **Co-locate + name by the file under test:** `file-name.ts` → `file-name.test.ts`
  (`my-component.tsx` → `my-component.test.tsx`). Never a generic name like `debug.test.tsx`.
- **Runner is bun:** `import { test } from "bun:test"` — **`test`, not `it`**. Run with `bun test`.

## Rules (from AGENTS.md)

- Tests must be **minimal, non-conflicting, and not race-prone**.
- **No timing-based tests** — no `setTimeout` / `setImmediate` / `sleep` / wall-clock waits.
- **No deep nesting** of describe/test blocks.
- **No duplicative tiny tests** — but every meaningful case should be covered. If you change a
  file that has tests, keep them green and **add a case if none covers your change**.

## MUST / NEVER

- **MUST** use `import { test } from "bun:test"` and co-locate as `<name>.test.ts(x)`.
- **MUST** keep the touched file's tests green and add a case for new behavior.
- **NEVER** use `it`, timing-based waits, deep nesting, or generically-named test files.
- **NEVER** add a redundant tiny test that overlaps an existing case.
