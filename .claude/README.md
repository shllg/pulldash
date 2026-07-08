# pulldash agentic suite

A lean HITL + supervised-AFK Claude Code + Codex harness for pulldash. Adapted from the mature
vendis/dailywerk setups, right-sized to one tool + one maintainer. The canonical contract is the
repo-root `AGENTS.md`; depth lives in `rules/`. **Nothing here can deploy** — see the safety floor.

## Layers

| Layer        | Where                                | What                                                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules        | `rules/NN-*.md`                      | Stack invariants + per-surface conventions + the autonomy contract. Not auto-loaded — the `AGENTS.md` loader table + `skill-reminder.sh` point at the right one.                                                                                                                                                                  |
| Hooks        | `hooks/*.sh`                         | `git-push-branch-guard.sh` (deploy floor), `standing-directives.sh` (session start), `skill-reminder.sh` (path→rule nudge). Wired in `settings.json`.                                                                                                                                                                             |
| Commands     | `commands/pd-*.md`                   | The HITL steering wheel.                                                                                                                                                                                                                                                                                                          |
| Skills       | `.agents/skills/pulldash-*/SKILL.md` | The loop logic: `pulldash-work` (AFK build loop), `pulldash-plan`, `pulldash-review`, `pulldash-rebase`, `pulldash-pr-finalize`, `pulldash-next`. **One source in `.agents/`, symlinked into `.claude/skills/` and `.codex/skills/`** — Claude and Codex share the same files. The `/pd-*` commands are thin delegators to these. |
| Agents       | `agents/*.md`                        | `codex-agent` (Codex MCP gateway), `pulldash-code-reviewer` (Claude review arm), `github-agent` (gh gateway), `pulldash-implementer` (optional AFK writer).                                                                                                                                                                       |
| Codex mirror | `.codex/`                            | `config.toml` + `rules/default.rules` (deploy floor: `git push` denied) + `agents/codex-review-agent.toml`; `prompts/pd-*.md` symlink the commands; `skills/` symlink `.agents/skills/`.                                                                                                                                          |

## HITL — the `/pd-*` steering wheel

| Command                 | Does                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `/pd-plan <input>`      | Plan a change → specified `ready-for-agent` issue (or into `/pd-work`).  |
| `/pd-work <task or #N>` | Supervised build loop → open PR → **stop** (never merges).               |
| `/pd-review`            | Dual-arm review (Claude + Codex) of the working diff.                    |
| `/pd-pr`                | Open/update a PR against `main` from the current feature branch.         |
| `/pd-checks <n>`        | Fail-closed merge-readiness verdict (wraps the `scripts/*.sh` chain).    |
| `/pd-pr-finalize <n>`   | Drive an open PR to mergeable (CI, rebase, drain threads). Never merges. |
| `/pd-rebase`            | Rebase the feature branch onto `origin/main`, `--force-with-lease`.      |
| `/pd-next`              | Pick the next `ready-for-agent` issue → route to `/pd-work`.             |
| `/pd-merge <n>`         | **The only deploy rail** — human-gated squash merge to `main`.           |

## The safety floor (mechanical, tool-agnostic)

`main` push → auto-deploys the web app to pulldash.com (Vercel); `v*` tag → irreversible 3-OS
Electron release. So:

- **`git push`** to `main`/`master` or any `v*` tag is **denied** by `git-push-branch-guard.sh`
  (fail-closed: jq-absent or unresolvable target → deny). Feature-branch pushes auto-allow.
- The floor is **tool-agnostic**: `settings.json` also **denies** the mutating GitHub MCP tools
  (`merge_pull_request`, `create_or_update_file`, `push_files`, `delete_file`,
  `update_pull_request_branch`) — a `git push` guard alone wouldn't stop an API-level mutation.
- **Merge is human-only**: `gh pr merge` is in the `ask` list (an unattended run can't answer →
  blocked; a human approves via `/pd-merge`).
- No `🤖` prefix, no `Co-Authored-By` trailer (this fork honors the operator's no-AI-attribution
  rule over upstream's `🤖` house style).

Full contract: `rules/19-git-and-autonomy.md`.

## AFK — supervised only

`/pd-work` (the `pulldash-work` skill) is the in-repo loop: build → `bun test`/`typecheck`/`fmt` → `/pd-review` → commit →
repeat, **hard-capped at 8 iterations / 30 min**, stops at an open PR. Run it and watch it; it
cannot reach `main`.

**Unattended runners (built pattern, NOT enabled — the chosen posture is supervised):**

- `ralph-loop` (installed plugin) for grind-to-green:
  `/ralph-loop "<task>" --completion-promise PULLDASH_GREEN --max-iterations N`
  — the promise is the real gate (`bun test && bun run typecheck && bun fmt:check`).
  `--max-iterations` is **mandatory** (honor-system promise + no manual stop otherwise).
- `night-orch` (existing daemon) for scheduled issue→PR: add a `{repo: shllg/pulldash,
baseBranch: main, branchPrefix: orch, doneMode: pr-ready, maxConcurrentRuns: 1}` entry with
  `verify: [bun install, bun test, bun run typecheck, bun run fmt:check, bun run build:browser]`.

**Before enabling any truly unattended run, add defense-in-depth for the deploy floor:** run
against a GitHub token scoped **without** `contents:write`/merge on the deploy repo — the one
residual the tool-permission denials can't cover is `gh api`/`gh api graphql` mutating via the API.

## Codex

Local Codex-as-reviewer/builder runs through `mcp__codex__codex` (registered in `.mcp.json`) via
the `codex-agent` gateway. PR-side Codex-bot comments are consumed by
`scripts/check_codex_comments.sh` (wired into `/pd-checks` + `/pd-pr-finalize`).

The **`.codex/` mirror** is real and kept DRY by symlinks, not a copy step: `.codex/skills/`
symlink `.agents/skills/` (the shared skill source), and `.codex/prompts/pd-*.md` symlink
`.claude/commands/`. Only `.codex/config.toml`, `.codex/rules/default.rules`, and
`.codex/agents/codex-review-agent.toml` are Codex-native files. Adding a command → symlink it into
`.codex/prompts/`; adding a skill → put it in `.agents/skills/` and symlink into both
`.claude/skills/` and `.codex/skills/`.
