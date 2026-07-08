---
description: Build a task to done on a feature branch with review baked in, then open a PR and stop.
---

# /pd-work

Invoke the `pulldash-work` skill to drive a work source (a GitHub issue, pasted intent, or a
described task) to a verified finish. It guards against the deploy branch, states a Definition of
Done, picks the build mode (default **Claude-builds**; Codex-builds opt-in), then runs the
build → `bun test`/`typecheck`/`fmt` → `/pd-review` → commit loop (capped, supervised) until the
gate is green — then opens a PR via `/pd-pr` and **HARD STOPS** for the human to merge.

Work item (task / issue # / pasted intent):

$ARGUMENTS
