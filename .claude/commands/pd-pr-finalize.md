---
description: Drive an open PR to mergeable — CI to green, rebase, drain review + Codex threads. Never merges.
---

# /pd-pr-finalize

Invoke the `pulldash-pr-finalize` skill to drive an already-open PR to a clean, mergeable state:
poll CI to green (`wait_pr_checks.sh`), rebase when behind, fix title/body, then drain the full
review surface — human threads (`check_pr_reviews.sh`) and Codex-bot comments
(`check_codex_comments.sh`) — fixing/replying/resolving each. Stops when CI-green and the surface
is drained, then hands off to the human's `/pd-merge`. **Never merges.**

PR (number/URL; else the current branch's PR):

$ARGUMENTS
