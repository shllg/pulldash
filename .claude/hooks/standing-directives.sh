#!/usr/bin/env bash
# .claude/hooks/standing-directives.sh
# SessionStart hook: surface pulldash's standing directives at the start of every
# fresh session. A hook cannot enforce these (it can't commit or push on the
# model's behalf) — this is a deterministic REMINDER, the one place the directives
# are guaranteed in front of the model at session start.
#
# Scoped to fresh sessions (startup/clear); skipped on resume/compact where the
# directives are already in carried-over context. Always exits 0 — can never break
# session start.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"
source="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null || true)"
case "$source" in
  startup | clear | "") ;;   # fresh session -> remind
  *) exit 0 ;;               # resume / compact -> already in context
esac

cat <<'MSG'
Standing directives for this session (AGENTS.md + .claude/rules/):
1. PERFORMANCE IS P1. pulldash exists because GitHub's PR review is slow. Jank, lag,
   unnecessary re-renders, and main-thread work are correctness defects, not nits.
2. Bun for everything; tsgo (not tsc) for typecheck; NEVER browser tools (they do not
   work with this project — verify UI at the data layer via `bun test`). Run
   `bun run typecheck` and `bun fmt` after changes.
3. Git safety is bounded by BRANCH (.claude/rules/19-git-and-autonomy.md): commit + push
   freely on feature/working branches; NEVER commit, push, or merge `main` (auto-deploys
   to pulldash.com via Vercel); NEVER push a `v*` tag (fires the Electron release). Agents
   open a PR and STOP — the operator merges. Never rewrite pushed history; never add an
   AI co-author / attribution trailer.
MSG
exit 0
