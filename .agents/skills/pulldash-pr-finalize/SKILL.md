---
name: pulldash-pr-finalize
description: Drive an already-open pulldash PR to mergeable — poll CI to green, rebase when behind, fix title/body, then drain the full review surface (human threads + Codex-bot comments), fixing/replying/resolving each. Stops when CI-green and the surface is drained; never merges. Use after /pd-pr, or when the user says "get this PR ready", "finalize PR #N", "drive it to green".
---

# Drive a PR to mergeable (never merge)

Take an open PR and drive it to a clean, mergeable state. Read + fix + reply + resolve — but
**never merge** (that's the human's `/pd-merge`, the deploy rail). Derive the repo via
`gh repo view` (pulldash is a fork).

## Loop until drained

1. **Poll CI to completion:**

   ```bash
   ./scripts/wait_pr_checks.sh <n>
   ```

   On failure: `./scripts/extract_pr_logs.sh <n> [step]`, reproduce locally with the mapped bun
   command (`bun run typecheck` / `bun fmt:check` / `bun test` / `bun run build:browser`), fix on
   the feature branch, commit, push (`git push` — feature branch, guard allows it), re-poll.

2. **Rebase when behind:** `mergeStateStatus = BEHIND` → `/pd-rebase` (rebase onto `origin/main`,
   `--force-with-lease` the feature branch), then re-poll.

3. **Fix title/body** to the `<type>: <summary>` convention (no `🤖`, no `Co-Authored-By`); body
   carries only what a reviewer can't infer.

4. **Drain the review surface** — both channels:
   - Human threads: `./scripts/check_pr_reviews.sh <n>` — for each unresolved thread, verify the
     point against the code, then **fix + reply + resolve** (`./scripts/resolve_pr_comment.sh <thread_id>`),
     or **reply and leave open** if you disagree (state why). Never resolve without addressing.
   - Codex-bot: `./scripts/check_codex_comments.sh <n>` — same handling for
     `chatgpt-codex-connector[bot]` comments.

5. **Re-fetch after each re-push** — new commits trigger a fresh review pass. Loop until CI is
   green AND no unresolved _valid_ threads remain (disagreements listed, replied, left open).

## Stop condition

Report **CI-green + surface-drained** with: PR URL, remaining disagreements (with rationale),
and the readiness verdict from `/pd-checks`. Then **STOP** — hand off to the human's `/pd-merge`.

## Never

- Never merge, never push `main`, never push a `v*` tag.
- Never resolve a thread you didn't actually address (a resolved thread with an unaddressed
  review-body item is a false pass).
- Never treat a missing/errored check as clean (fail-closed).
