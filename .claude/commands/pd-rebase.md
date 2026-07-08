---
description: Rebase the current feature branch onto origin/main, conflicts synthesized.
---

# /pd-rebase

Invoke the `pulldash-rebase` skill to rebase the current feature branch onto its base (default
`origin/main`), synthesizing every conflict from both intents rather than picking a side. After a
clean rebase it force-pushes the **feature branch** with `--force-with-lease` (never `main`/
`master`/`v*` — the `git-push-branch-guard.sh` hook blocks those).

Optional target branch:

$ARGUMENTS
