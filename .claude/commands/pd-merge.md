---
description: Human-gated squash merge to main — the only deploy rail. Read-only until one confirm.
allowed-tools: [Bash, Read, Glob, Grep, AskUserQuestion]
---

# /pd-merge — human-gated squash merge to main

$ARGUMENTS

**Human-invoked only. NEVER merge without an explicit `AskUserQuestion` confirmation** — every
step is read-only until the single gated merge in Step 4. If anything is ambiguous, stop and ask.

Merging into `main` **auto-deploys the web app to pulldash.com (Vercel)**. That is the deploy
consequence this gate exists for. `gh pr merge` is a server-side merge (not a local push), so no
hook sees it — it is in the settings `ask` list and **this confirm is the only rail**. The
`pd-work` AFK loop never calls this command.

## Step 0 — resolve

`repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)`. Resolve the PR from `$ARGUMENTS`
or `gh pr view --json number,headRefName,baseRefName,state,url`. Stop if none or state ≠ OPEN.
Confirm `baseRefName` is `main` (feature-into-feature merges are rare here).

## Step 1 — readiness (allowlist green; unknowns fail safe)

```bash
gh pr view <n> --json number,title,state,isDraft,mergeable,mergeStateStatus,\
reviewDecision,statusCheckRollup,headRefName,headRefOid,baseRefName,url,commits,body
```

Treat as **READY** only when every signal is known-good; everything else (incl. `UNKNOWN`/`null`/
pending) is **NOT READY**:

| Signal              | READY requires                            | Otherwise                                                                   |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `isDraft`           | `false`                                   | stop — ready it first                                                       |
| `mergeable`         | `MERGEABLE`                               | `CONFLICTING`/`UNKNOWN` → stop                                              |
| `mergeStateStatus`  | `CLEAN` (or `HAS_HOOKS`)                  | `BEHIND` → `/pd-rebase`; `DIRTY` → stop; `BLOCKED`/`UNSTABLE` → surface why |
| `statusCheckRollup` | every check `SUCCESS`/`NEUTRAL`/`SKIPPED` | anything else (incl. pending/`null`) → flag                                 |

Also confirm no unresolved Codex-bot comments: `./scripts/check_codex_comments.sh <n>`, and no
unresolved human threads: `./scripts/check_pr_reviews.sh <n>`. Render **READY** / **NOT READY**
with blocking reasons.

## Step 2 — synthesize the squash message (read-only)

- **Subject:** default to the PR `title` (already `<type>: <summary>`), single line.
- **Body:** summarize, don't dump — collapse `WIP:`/fixup noise into a few clean bullets from
  `gh pr view <n> --json commits --jq '.commits[].messageHeadline'` +
  `gh pr diff <n> --name-only`.
- **No AI attribution / `Co-Authored-By` / `🤖`** anywhere. Show subject + body before the gate.

## Step 3 — (nothing; Step 2 output feeds Step 4)

## Step 4 — the gate (single AskUserQuestion)

State the deploy consequence in the question: **"Merging into `main` → auto-deploys to
pulldash.com (Vercel)."** Options:

- **Merge (squash)** _(Recommended)_
- **Merge + delete branch** (adds `--delete-branch`)
- **Edit message** (back to Step 2)
- **Override and merge anyway** — shown only when the verdict was NOT READY; spelled out as a
  deliberate override of the listed blockers.

The human answering **is** the operator go-ahead.

## Step 5 — merge (race-pinned)

```bash
printf '%s' "<body>" | gh pr merge <n> --squash \
  --match-head-commit "<headRefOid>" --subject "<subject>" --body-file -
```

- `--match-head-commit "<headRefOid>"` (from Step 1) aborts if a commit landed after the
  readiness check — turns read→ask→merge into a real guarantee.
- `--body-file -` so quotes/`$`/backticks can't break the shell; subject stays single-line.
- Add `--delete-branch` only if chosen. **NEVER** run `git push`.

Re-query `gh pr view <n> --json state,mergedAt` — report MERGED + URL (or "queued" if not
immediate). Then offer to close the tracking issue if one is linked (see `/pd-next` wiring).

## Never

- Never merge without the Step 4 gate. Never add AI attribution. Never `git push`. Never
  `mcp__github__merge_pull_request` (denied). Never push a `v*` tag.
