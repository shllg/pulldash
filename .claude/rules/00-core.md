# pulldash Core Architecture

> **Purpose:** Foundational facts and non-negotiable rules for every task. Always-on.

## What pulldash is

The fastest way to review pull requests — a **client-side** app that talks directly to the
GitHub API (Octokit, CORS, no backend proxy). Performance is the whole reason it exists.

## Architecture mental model

```
                       ┌─ Browser SPA (pulldash.com, Vercel)
one browser bundle ────┼─ Hono server (src/index.ts on Vercel · src/node/main.ts local)
(src/browser/**)       └─ Electron desktop (electron-builder + electron-updater)
        │
        └─→ GitHub API directly (Octokit, client-side, CORS) — no backend
State lives OUTSIDE React in an external store (useSyncExternalStore).
Diff parse + syntax highlight run in a Web Worker pool, off the main thread.
```

## Stack

- **Runtime/pkg/test:** Bun (exclusively). **Typecheck:** `tsgo --noEmit` (the
  `@typescript/native-preview` compiler — **NOT** tsc). **Format:** Prettier.
- **UI:** React 19 + react-router-dom 7, Tailwind v4, shadcn/ui (new-york, Radix, lucide),
  cva/clsx/tailwind-merge.
- **Diff:** gitdiff-parser/diff + refractor/rehype-highlight in a worker pool.
- **Telemetry:** posthog-js (app-level). **License:** AGPL-3.0.

## Commands (the only correct invocations)

| Purpose              | Command                                 |
| -------------------- | --------------------------------------- |
| Test                 | `bun test`                              |
| Typecheck            | `bun run typecheck` (→ `tsgo --noEmit`) |
| Format (write)       | `bun fmt`                               |
| Format (check)       | `bun fmt:check`                         |
| Build browser bundle | `bun run build:browser`                 |
| Dev (web)            | `bun dev`                               |
| Dev (desktop)        | `bun electron:dev`                      |

## MUST

- **MUST** use Bun for everything — package management, scripts, tests. Never npm/yarn/pnpm.
- **MUST** run `bun run typecheck` and `bun fmt` after changes; keep touched-file tests green.
- **MUST** treat performance as P1 — jank/lag/unnecessary re-render/main-thread work are
  correctness defects (see `01-frontend-and-store.md`).
- **MUST** test at the data layer; the frontend renders the data dumbly (see `05-testing.md`).

## NEVER

- **NEVER** use browser tools (`mcp__claude-in-chrome__*`, chrome-devtools, Playwright, or
  WebFetch-as-scraper) against this project — they do not work here. Verify UI behavior via
  `bun test` at the data layer.
- **NEVER** use tsc semantics or assume a Node/webpack toolchain — it is Bun + tsgo.
- **NEVER** introduce a backend proxy for GitHub calls — pulldash is entirely client-side.
- **NEVER** commit, push, or merge `main`, and **NEVER** push a `v*` tag (both deploy).
  Detail: `19-git-and-autonomy.md`.

## Key references

- `AGENTS.md` — the canonical human+agent contract (rule-loader table at the bottom).
- `.claude/rules/19-git-and-autonomy.md` — branch-bounded git safety + HITL/AFK contract.
- `README.md` — product overview.
