---
description: Open (or update) a PR against main from the current feature branch — human-gated.
allowed-tools: [Bash, Read, Glob, Grep, AskUserQuestion]
---

# /pd-pr — open a PR against main

$ARGUMENTS

Push the current feature branch and open a PR against `main`. Never touches `main` itself.

## Guards (stop conditions)

- **Refuse if the current branch is `main`/`master`.** Offer to cut a `feat/*` branch first.
  Agents never commit/push/PR the deploy branch (`.claude/rules/19-git-and-autonomy.md`).
- Working tree should be committed (WIP squashed to the final shape). If dirty, surface it.

## Steps

1. **Resolve state:** `git rev-parse --abbrev-ref HEAD`, `git status --short`,
   `git log origin/main..HEAD --oneline` (what will ship). Derive repo via `gh repo view`.

2. **Reuse before create.** `gh pr view --json number,url,state 2>/dev/null` — if an OPEN PR
   already exists for this branch, **update it** (push, then edit title/body); never close/recreate.

3. **Assemble the title:** `<type>: <summary>` where type ∈ `feat|fix|perf|refactor|ci|bench`.
   **No `🤖` prefix, no `Co-Authored-By:` / AI-attribution trailer** (`19-git-and-autonomy.md`).
   Body carries only what a busy reviewer cannot infer — implementation nuances, validation steps
   (AGENTS.md). Show the title + body before opening.

4. **Confirm (AskUserQuestion):** Open PR / Edit message / Cancel. (HITL gate; under the `pd-work`
   loop this is the hard stop — the loop presents the PR and does not merge.)

5. **Push + open:**
   ```bash
   git push -u origin HEAD            # feature branch — the push guard allows this
   gh pr create --base main --title "<title>" --body-file -   # body via stdin
   ```
   Then hand off to `/pd-checks <n>` to drive CI/readiness.

**Never** `git push origin main`, never `--tags`, never merge here.
