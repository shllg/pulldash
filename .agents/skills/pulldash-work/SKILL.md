---
name: pulldash-work
description: Take a work source — a GitHub issue, pasted intent, or a described task — and drive it to a verified finish on a feature branch with review baked in, then open a PR and STOP for the human to merge. Supervised AFK. Use when the user says "work this", "/pd-work", "implement this", "build this to done", or "grind until green".
---

# Work an implementation to done (supervised, stop at PR)

Take any work source and drive it to a verified finish **on a feature branch**, looping
build → test → review → commit until the Definition of Done is met, then open a PR and
**HARD STOP** — the human merges (merging `main` auto-deploys to pulldash.com). This is the
AFK engine; it never pushes `main`, never pushes a `v*` tag, never merges.

Governed by `.claude/rules/19-git-and-autonomy.md`. Best run under Ultracode (the review
fan-out is what parallel agents are for).

## 0. Branch guard (first, always)

Read the current branch. **If `main`/`master`, STOP** and offer to cut a `feat/*` (or
`fix/*`/`perf/*`) branch — the loop never works on the deploy branch. Only proceed on a
feature/working branch.

## 1. Ingest the source

Detect and read the source fully:

- **GitHub issue** — `#N`/URL: `gh issue view <N> --json number,title,body,labels,url,comments`
  (derive repo via `gh repo view`; pulldash is a fork). A thin one-liner with no acceptance
  criteria → stop and ask for specifics; implement only a specified source.
- **Pasted intent / current chat** — use as-is.

Map the code the work touches with `Explore` subagents (the store/hooks under
`src/browser/contexts/**`, components, `src/api/**`, the runtime entries, the tests covering
the area, plus the applicable `.claude/rules/*`). Want conclusions — file paths, patterns,
constraints — not raw dumps. Print a one-paragraph hypothesis read.

## 2. Definition of Done + completion gate

State a one-line **Definition of Done** in observable terms. The **completion gate** is:

```bash
bun test && bun run typecheck && bun fmt:check
```

Add `bun run build:browser` to the gate when the change touches bundling or a runtime entry
(`04-runtime-targets.md`). Frozen the acceptance criteria before building.

## 3. Mode (one decision, session-scoped)

- **Build mode — default Mode 1: Claude builds, Codex reviews.** Mode 2 (Codex builds via the
  `codex-agent` gateway, `mcp__codex__codex`) is an explicit opt-in.
- **Writer:** serial single-writer by default (the main thread, or one `pulldash-implementer`
  agent). Fan out only for genuinely independent slices — one writer per file/pass, never two
  agents editing at once.
- **Supervised-AFK autonomy:** under the loop, a decision that would be an `AskUserQuestion` in
  pure HITL auto-resolves to the **conservative default** (keep scope, don't guess "done", leave
  merge to the human). **Judgment forks always stop** (ambiguous spec, destructive/irreversible,
  a genuine design fork) — surface and wait.

## 4. Loop to completion

Repeat, tracking a live TODO list, until the gate is green:

1. **Implement** the next small slice (perf is P1 — `01-frontend-and-store.md`; logic in the
   store/hooks, not components — `02-data-layer.md`).
2. **Test at the data layer** — add/adjust a co-located `*.test.ts` (`05-testing.md`); run the
   targeted test, then the full `bun test`.
3. **`bun run typecheck` + `bun fmt`.**
4. **Review — `/pd-review`** (Claude arm `pulldash-code-reviewer` + Codex arm `codex-agent`,
   pointers-not-diff). A missing/errored arm is never "clean."
5. **Verification pass** — check EACH prior finding as FIXED / NOT-FIXED / REGRESSED against the
   code; the builder's own claim never counts as verified.
6. **Commit `WIP:`** on the feature branch as a rollback point.

**Hard caps (mandatory — a perpetually-red loop is a runaway):** stop-and-report after **8
iterations** OR **30 minutes** without reaching the gate, whichever first. Report where it stalled.

## 5. Endgame — squash, PR, STOP

Once the completion gate is green and a **fresh** Codex review (`codex-agent`, read-only, new
thread) confirms no findings:

1. **Squash** the `WIP:` checkpoints into the final commit(s): `<type>: <summary>`, **no `🤖`,
   no `Co-Authored-By`**.
2. **Open the PR** via `/pd-pr` (pushes the feature branch — the push guard allows it) against
   `main`.
3. **Drive it to mergeable** via `pulldash-pr-finalize` (CI to green, rebase if behind, drain review
   and Codex-bot threads).
4. **HARD STOP.** Report: PR URL, gate result, open questions. **Never merge** — the human runs
   `/pd-merge`. The loop is done.

## Never

- Never commit/push/merge `main`; never push a `v*` tag; never `mcp__github__merge_pull_request`.
- Never treat a missing/errored review or CI check as clean.
- Never exceed the iteration/time caps without stopping to report.
- Never use browser tools — verify UI at the data layer via `bun test`.
