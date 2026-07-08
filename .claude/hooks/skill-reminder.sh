#!/usr/bin/env bash
# .claude/hooks/skill-reminder.sh
# PreToolUse (Edit|Write) hook: maps the edited file path to the relevant
# .claude/rules/NN-*.md and prints an advisory reminder. Non-blocking (exit 0) —
# the rules are not auto-loaded, so this is the nudge that points at the right one.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
IFS=$'\t' read -r TOOL_NAME FILE_PATH <<< \
  "$(printf '%s' "$INPUT" | jq -r '[.tool_name // "", .tool_input.file_path // ""] | @tsv' 2>/dev/null)"
[[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" ]] || exit 0
[[ -z "$FILE_PATH" ]] && exit 0

RULE=""
SECONDARY=""
case "$FILE_PATH" in
  *.test.ts | *.test.tsx)
    RULE="05-testing.md" ;;
  */src/browser/contexts/*)
    RULE="02-data-layer.md"; SECONDARY="01-frontend-and-store.md, 05-testing.md" ;;
  */src/browser/*.tsx | */src/browser/*/*.tsx)
    RULE="01-frontend-and-store.md"; SECONDARY="02-data-layer.md, 05-testing.md" ;;
  */src/api/*)
    RULE="03-github-api.md"; SECONDARY="02-data-layer.md, 05-testing.md" ;;
  */src/electron/* | */src/node/* | */src/index.ts)
    RULE="04-runtime-targets.md" ;;
  */scripts/*.sh)
    RULE="19-git-and-autonomy.md"; SECONDARY="the PR flow in AGENTS.md" ;;
  *) exit 0 ;;
esac

MSG="Reminder: .claude/rules/$RULE holds pulldash conventions for this file — load it if not already."
[[ -n "$SECONDARY" ]] && MSG="$MSG Also consider: $SECONDARY."
MSG="$MSG Always-on: 00-core.md (stack/non-negotiables), 20-simplicity.md (review lens). Perf is P1."
echo "$MSG"
exit 0
