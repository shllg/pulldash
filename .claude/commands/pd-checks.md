---
description: Merge-readiness gate — run the fixed scripts/*.sh chain and report a fail-closed verdict.
allowed-tools: [Bash, Read]
---

# /pd-checks — is this PR ready?

$ARGUMENTS (PR number; else resolve from the current branch)

Wrap the repo's PR helpers into one fail-closed readiness verdict. Read-only.

## Steps

1. **Resolve the PR:** use `$ARGUMENTS`, else `gh pr view --json number,url,state`. Stop if none
   or if state ≠ OPEN (report merged/closed).

2. **Drive CI + readiness:**

   ```bash
   ./scripts/wait_pr_checks.sh <n>
   ```

   It guards a clean tree + local==remote, hot-loops `gh pr view` / `gh pr checks`, decodes
   `mergeable` / `mergeStateStatus` (CONFLICTING/DIRTY/BEHIND/BLOCKED/CLEAN), and on all-green
   also runs `check_pr_reviews.sh` (human threads) + `check_codex_comments.sh` (Codex-bot).

3. **On failure**, surface the fix path and stop:
   - CI failed → `./scripts/extract_pr_logs.sh <n> [step]` for logs; reproduce locally with the
     mapped `bun` command (`bun run typecheck` / `bun fmt:check` / `bun test` / `bun run build:browser`).
   - `BEHIND` → `/pd-rebase`.
   - Unresolved threads → list them; fix + `./scripts/resolve_pr_comment.sh <thread_id>` (or `/pd-pr-finalize`).

4. **Verdict — fail closed.** Report **READY** only when CI is all-green, `mergeStateStatus` is
   `CLEAN`, and both check scripts pass. Any unknown/null/pending signal → **NOT READY**. Never
   call a missing/errored check "clean".

This command **does not merge** — a READY verdict hands off to the human's `/pd-merge`.
