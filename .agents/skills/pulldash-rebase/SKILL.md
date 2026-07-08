---
name: pulldash-rebase
description: Rebase the current feature branch onto origin/main, synthesizing every conflict from both intents rather than picking a side, then force-with-lease the feature branch (never main/master/v*). Use when the user says "/pd-rebase", "rebase onto main", or when a PR is BEHIND.
---

# pulldash-rebase

Rebase the current **feature** branch onto its base and force-push the feature branch only.

## Guards

- **Refuse on `main`/`master`.** Never rebase or force-push a deploy branch (the push guard
  denies it anyway; don't try). `19-git-and-autonomy.md`.
- Working tree must be clean — commit or stash first; surface if dirty.

## Steps

1. `git fetch origin`.
2. `git rebase origin/main` (or the target passed in `$ARGUMENTS`).
3. **Conflicts:** resolve each by honoring **both** intents — the base change and this branch's
   change — never blindly pick a side. Anything ambiguous or semantically risky is a judgment
   fork → stop and ask. Re-run `bun run typecheck` + `bun test` after resolving.
4. **Push the feature branch** with lease: `git push --force-with-lease` (the guard allows a
   feature branch; denies `main`/`master`/`v*`).
5. Report the new state; if a PR exists, suggest `/pd-checks <n>` to re-poll CI.

Never rebase onto or force-push `main`; never rewrite already-merged shared history.
