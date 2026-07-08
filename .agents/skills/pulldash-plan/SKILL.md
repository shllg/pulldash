---
name: pulldash-plan
description: Plan a pulldash feature or change with the perf-is-P1, external-store data-layer, client-side GitHub API, and three-runtime-target constraints baked in, then route the result into a GitHub issue (or straight into pulldash-work). Use when the user asks to plan a feature, wants an approach/architecture decision, implementation steps, or a testing plan before building. This is the "plan" counterpart to pulldash-work (which builds).
---

# pulldash-plan

Plan a pulldash change, then route it onward. Planning is read-only — it produces a plan and
(optionally) an issue; it does not write code.

## Required reading

Always load `.claude/rules/00-core.md` (stack + non-negotiables) and `.claude/rules/20-simplicity.md`
(the smaller-shape lens). Then load the rule(s) for the surface the work touches:

- `src/browser/**` → `01-frontend-and-store.md`; `src/browser/contexts/**` → `02-data-layer.md`
- `src/api/**` → `03-github-api.md`; `src/electron|node|index.ts` → `04-runtime-targets.md`
- tests → `05-testing.md`

## Intake — ask first

After a quick repo scan to ground yourself, ask **one** binary question via `AskUserQuestion`
before planning:

> **Quick change, or a substantial feature?**

- **Quick / self-contained** — a bug fix, one hook, a contained tweak. Lightweight route: a
  concise plan → a single GitHub issue (or hand straight to `pulldash-work`).
- **Substantial** — a cross-cutting change, a new surface, anything needing design thought.
  Full route: an explored, trade-off-weighed plan → a specified GitHub issue (`ready-for-agent`).

This sets the route for the session; the Endgame executes it (reclassify once only if scope was
misjudged).

## Workflow

1. **Explore, retrieval-led.** Dispatch `Explore` subagents to map what the change touches — the
   store + hooks under `src/browser/contexts/pr-review/`, the components that render it, `src/api/**`
   loaders, the affected runtime entry, and the tests covering the area. Want conclusions (file
   paths, existing patterns, constraints), not raw dumps. Reuse an existing hook/selector before
   proposing a new one (`20-simplicity.md`). For genuinely **external** research (a new library/API,
   an approach), use `/deep-research` for that part — not for codebase exploration.

2. **Design against the pulldash invariants.** State the approach and call out, explicitly:
   - **Performance (P1):** what runs on the render vs main thread vs worker pool; where re-renders
     could regress; what must stay virtualized/memoized.
   - **Data layer:** what new logic goes in the store/hooks (not components); whether the store
     already owns the state (no second source of truth).
   - **GitHub API:** client-side/CORS/rate-limit implications; no backend proxy.
   - **Runtime targets:** does it stay in the shared bundle, or touch Electron/Hono? IPC/secret
     boundary if Electron.

3. **Implementation steps + testing plan.** Ordered, small slices. Name the data-layer
   `bun test` cases each slice needs (`05-testing.md`) and the completion gate
   (`bun test && bun run typecheck && bun fmt:check`, plus `bun run build:browser` if bundling/
   runtime changes).

4. **Flag risks + open questions** — anything that's a judgment fork (ambiguous spec, a design
   choice with no clear default) surfaces here for the human, not a guess.

## Endgame — route

- **Quick route:** write a concise GitHub issue (`gh issue create`, label `ready-for-agent`) with
  the plan as acceptance criteria, or hand the plan straight to `pulldash-work` if the user wants
  to build now.
- **Substantial route:** write a specified `ready-for-agent` issue (goal, approach, steps, testing
  plan, risks). Do not open a PR — planning stops at a specified, actionable issue.

Never write code here. Never open a PR. Never guess an ambiguous spec — surface it.
