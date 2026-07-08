# Git & Autonomy — Bounded by Branch, Tool-Agnostic Deploy Floor

> **Purpose:** Define what an agent may do on its own vs. what stays human, and make the
> deploy-branch floor **mechanical** (a hook + permission denials), not just prose. The git
> boundary is the **branch/ref**, not who is driving.

## The deploy floor (non-negotiable, mechanical)

pulldash has **two irreversible deploy axes**:

1. **Every push to `main` auto-deploys the web app to pulldash.com via Vercel.**
2. **Every `v*` tag push fires an irreversible 3-OS Electron release** (`release.yml`).

Therefore:

| Ref                                                                           | Commit    | Push      | Merge                                     |
| ----------------------------------------------------------------------------- | --------- | --------- | ----------------------------------------- |
| feature/working branch (`feat/* fix/* perf/* refactor/* ci/* chore/* orch/*`) | ✅ freely | ✅ freely | n/a                                       |
| `main` (deploy)                                                               | ❌ never  | ❌ never  | ❌ never autonomously — **operator only** |
| `v*` release tag                                                              | —         | ❌ never  | —                                         |

**Mechanical enforcement (not honor-system):**

- **`git push`** is gated by `.claude/hooks/git-push-branch-guard.sh` (PreToolUse): allows
  feature-branch pushes with no prompt, **denies** `main`/`master` and any `v*` tag, and is
  **fail-closed** (jq-absent or unresolvable target → deny).
- **The floor is tool-agnostic.** A `git push` guard alone is not enough — the connected
  `github` MCP server can mutate `main` over the API without touching Bash. So
  `.claude/settings.json` **denies** the mutating GitHub MCP tools:
  `mcp__github__merge_pull_request`, `create_or_update_file`, `push_files`, `delete_file`,
  `update_pull_request_branch`. All remote writes go through git/gh on a feature branch.
- **Merge is human-only.** `gh pr merge` is in the settings `ask` list — an unattended run
  cannot answer the prompt (so it is blocked), and a human explicitly approves it via
  `/pd-merge`. `mcp__github__merge_pull_request` is denied outright.
- **Documented residual:** `gh api` / `gh api graphql` are allowed (the PR scripts need
  them) and can technically mutate via the API. For a **truly unattended** run, additionally
  run against a GitHub token scoped without `contents:write`/merge on the deploy repo. Under
  the **supervised** AFK posture (below) a human is watching, so this is an accepted residual.

## Commit shape & attribution

- Conventional subject: `<type>: <summary>` where type ∈ `feat|fix|perf|refactor|ci|chore|bench`.
- **NO `🤖` prefix and NO `Co-Authored-By:` / AI-attribution trailer** on any commit, PR
  title, or PR body. (The upstream coder/pulldash AGENTS.md `🤖` house style is intentionally
  **not** followed on this fork — the operator's no-AI-attribution rule governs. Flip only on
  explicit operator opt-in.)
- Make `WIP:` checkpoints during a run as rollback points, then squash to the final shape
  before finishing. Never rewrite already-pushed shared history (add new commits instead);
  `--force-with-lease` is fine on a solely-owned, unmerged feature branch after a rebase.

## HITL vs AFK

**HITL is the default.** The operator drives via `/pd-*` commands and approves at every
mutating gate (AskUserQuestion). Nothing merges without an explicit human confirm.

**AFK is opt-in and SUPERVISED** (no overnight/unattended runners enabled). The `pulldash-work`
skill runs the build → test → review → commit loop hands-off on a feature branch and **HARD
STOPS at an open PR** — it never pushes `main`, never merges. The same decision that is an
AskUserQuestion in HITL auto-resolves to the **conservative default** under `pulldash-work` (keep
scope, don't guess "done", leave the merge to the human) so a loop cannot deadlock.

- **Every AFK loop MUST carry a hard max-iteration + wall-clock cap** and stop-and-report on
  reaching it (a perpetually-red loop is a runaway). `pulldash-work` states its cap; the reused
  `ralph-loop` uses `--max-iterations` (mandatory, not optional).
- **Never** treat a missing or errored review/CI check as "clean" (fail-closed).

## Judgment forks — always human (every mode)

- Ambiguous spec → ask/grill, don't guess.
- Destructive/irreversible → data loss, history rewrite, force-push of shared history.
- Outward-facing → pushing a deploy ref (forbidden anyway), merging, publishing.
- A genuine design fork with no sensible default.

## Cross-references

- `00-core.md` — NEVER rules (deploy floor summary).
- `.claude/hooks/git-push-branch-guard.sh` — the mechanical push rail.
- `.claude/settings.json` — the MCP-write denials + `gh pr merge` ask gate.
- `.agents/skills/pulldash-work/SKILL.md` (symlinked into `.claude/skills/` + `.codex/skills/`) — the AFK loop this contract governs.
- `.claude/commands/pd-merge.md` — the human-gated squash-merge rail.
