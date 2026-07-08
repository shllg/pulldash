# Frontend & External Store (`src/browser/**`)

> **Load when:** editing anything under `src/browser/**` (React components, UI, store wiring).
> **Perf is P1 here more than anywhere** — this is the render path pulldash exists to keep fast.

## Shape

- **State lives OUTSIDE React** in an external store read via `useSyncExternalStore`. The
  store + its hooks are the data layer under `src/browser/contexts/**` (see
  `02-data-layer.md`). Components (`src/browser/components/**`) and UI primitives
  (`src/browser/ui/**`) **render the data dumbly** — logic belongs in the store/hooks, not JSX.
- **Diff parsing + syntax highlighting run in a Web Worker pool** (`src/browser/lib/diff-worker.ts`,
  `src/browser/lib/diff.ts`) — off the main thread. Never move that work back onto the render thread.
- React 19 + react-router-dom 7, Tailwind v4, shadcn/ui primitives in `src/browser/ui/`
  (new-york style, Radix, lucide, cva/clsx via `cn.ts`). Reuse a `ui/` primitive before adding one.

## Render discipline (P1)

- **No new object/array/function literals in props on the hot path** — a new ref every render
  forces children to re-render. Hoist, `useMemo`, or `useCallback` (or select narrowly from the
  store). This is the #1 pulldash perf defect.
- **Subscribe narrowly.** Read the smallest slice a component needs from the store so unrelated
  updates don't re-render it. Prefer a purpose-built `use…` selector hook over reading the whole context.
- **Large lists must stay virtualized** (`@tanstack/react-virtual`) — never render a full file/diff list.
- Derive, don't duplicate: compute from store state in a selector hook rather than mirroring it into
  component `useState` + an effect.
- Measure claims. If you assert something is faster/smoother, say how you'd observe it (React DevTools
  re-render count, a profile) — but NEVER via browser automation tools (forbidden here).

## MUST / NEVER

- **MUST** keep components thin and the store authoritative; put new logic in a hook under
  `src/browser/contexts/**`, not in a component.
- **MUST** run `bun run typecheck` + `bun fmt` after changes.
- **NEVER** add main-thread work that belongs in the worker pool or a memoized selector.
- **NEVER** verify UI with browser tools — cover behavior with a data-layer `bun test` instead.
