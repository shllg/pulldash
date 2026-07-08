@AGENTS.md

## Claude Code

Keep this file short and project-level. `AGENTS.md` is the canonical contract (shared by
Claude + Codex); add Claude-specific notes here only when they affect instruction-loading.

### Rule loading

Depth lives once in `.claude/rules/NN-*.md`. These are **not** auto-loaded by Claude Code —
load the matching rule when the work touches its surface (the `.claude/hooks/skill-reminder.sh`
nudge and the `AGENTS.md` rule-loader table point you to the right one):

| When you…                                             | Load                                     |
| ----------------------------------------------------- | ---------------------------------------- |
| do anything (always-on)                               | `.claude/rules/00-core.md`               |
| edit `src/browser/**` (React/store)                   | `.claude/rules/01-frontend-and-store.md` |
| edit `src/browser/contexts/**` (data layer)           | `.claude/rules/02-data-layer.md`         |
| edit `src/api/**` (GitHub/Octokit)                    | `.claude/rules/03-github-api.md`         |
| edit `src/electron/**`, `src/node/**`, `src/index.ts` | `.claude/rules/04-runtime-targets.md`    |
| add/change tests (`**/*.test.ts(x)`)                  | `.claude/rules/05-testing.md`            |
| commit / push / PR / merge                            | `.claude/rules/19-git-and-autonomy.md`   |
| review any change                                     | `.claude/rules/20-simplicity.md`         |

### Non-negotiables (see `00-core.md` / `19-git-and-autonomy.md`)

- **NEVER** use browser tools against this project — verify UI at the data layer via `bun test`.
- **NEVER** commit/push/merge `main` or push a `v*` tag — both deploy. Agents open a PR and stop.
- No `🤖` prefix, no `Co-Authored-By:` / AI-attribution trailer on commits/PRs.
- Performance is P1; Bun for everything; `tsgo` (not tsc) for typecheck.

### Commands & skills

`/pd-*` slash commands are the HITL steering wheel (`.claude/commands/`: pd-plan, pd-work,
pd-review, pd-pr, pd-checks, pd-pr-finalize, pd-rebase, pd-next, pd-merge) and are thin delegators.
Loop logic lives in the `pulldash-*` skills single-sourced in `.agents/skills/` (pulldash-work,
pulldash-plan, pulldash-review, pulldash-rebase, pulldash-pr-finalize, pulldash-next), symlinked
into `.claude/skills/` and `.codex/skills/`. Full map: `.claude/README.md`.
