# Data Layer — the PR-review store (`src/browser/contexts/**`)

> **Load when:** editing the store or its hooks under `src/browser/contexts/**` (esp.
> `contexts/pr-review/`), or adding/adjusting the logic a component reads.

## What it is

`src/browser/contexts/pr-review/` is pulldash's **data layer**: `index.tsx` holds the external
store; the `use*.ts` hooks (e.g. `useDiffLoader`, `useCommentActions`, `useReviewActions`,
`useSelectionState`, `useKeyboardNavigation`, `useCommentsByFile`, …) are its API surface. Other
contexts (`auth.tsx`, `github.tsx`, `tabs.tsx`, `telemetry.tsx`) follow the same shape. **This is
where behavior lives** — components just render what these hooks return.

## Rules

- **Tests live here.** Per AGENTS.md, testing happens primarily at the data layer; the sole
  existing test is `contexts/pr-review/index.test.ts`. When you change a hook's behavior, keep its
  test green and add a case if none covers the change (see `05-testing.md`). Don't test through the
  component — test the store/hook directly.
- **One responsibility per hook.** The `pr-review` folder is intentionally many small
  single-purpose hooks (`useIsLineFocused`, `useCurrentFile`, …). Add a new small hook rather than
  growing a god hook; reuse an existing selector before writing a parallel one (`20-simplicity.md`).
- **Keep updates cheap and narrow.** Store writes should touch the minimum state so
  `useSyncExternalStore` subscribers re-render minimally (perf is P1 — `01-frontend-and-store.md`).
- **Loaders own async.** Data fetching from GitHub goes through the `use*Loader` hooks talking to
  `src/api/**` (`03-github-api.md`) — not ad-hoc `fetch` in components.

## MUST / NEVER

- **MUST** put new logic (selection, comments, diff, review state) in a hook here, not in a component.
- **MUST** cover a behavior change with a data-layer test.
- **NEVER** mirror store state into component `useState` — derive it via a selector hook.
- **NEVER** introduce a second source of truth for something the store already owns.
