#!/usr/bin/env bash
# .claude/hooks/git-push-branch-guard.sh
# PreToolUse hook (if: Bash(git push:*)). Branch/ref-aware deploy-branch floor.
# Enforces .claude/rules/19-git-and-autonomy.md:
#   - DENY  push whose target ref is the deploy branch (main / master)
#   - DENY  push of a v* release tag (v* tags fire the irreversible 3-OS
#           Electron release via release.yml)
#   - ALLOW push to any feature/working branch (auto-approve, no prompt)
# Fail-CLOSED: main auto-deploys to pulldash.com (Vercel) on every push, so if
# jq is missing OR the target ref cannot be resolved, we DENY rather than defer.
# (A no-op guard on a deploy repo is worse than a blanket deny — push with the
# `!` prefix if a block is a false positive.)
set -uo pipefail

# --- fail-closed helpers (must not require jq) ---------------------------------
deny_raw() {  # $1 = reason (no embedded double-quotes)
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

command -v jq >/dev/null 2>&1 || deny_raw "git-push-branch-guard: jq unavailable, cannot verify the push target — blocking per the deploy-branch floor (.claude/rules/19-git-and-autonomy.md). Push manually with the ! prefix if intended."

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[[ -z "$cmd" ]] && exit 0   # not a resolvable command string → let normal rules apply

repo_dir="${CLAUDE_PROJECT_DIR:-.}"
deny_branch_re='^(main|master)$'
tag_re='^(refs/tags/)?v[0-9]'   # v0.0.6, refs/tags/v1.2.3, …

current_branch() { git -C "$repo_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""; }

emit() {  # $1 = allow|deny  $2 = reason
  jq -cn --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# Any `--tags` push (pushes every local tag, including a fresh v*) → deny.
if printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])--tags([[:space:]]|=|$)'; then
  emit deny "Refusing 'git push --tags' — a v* tag push fires the irreversible 3-OS Electron release (release.yml). The operator cuts releases (.claude/rules/19-git-and-autonomy.md)."
fi

# Resolve candidate target refs from the push command.
declare -a targets=()
rest="$(printf '%s' "$cmd" | sed -E 's/.*git[[:space:]]+push//')"
read -ra toks <<< "$rest"
remote_seen=0
for t in "${toks[@]}"; do
  [[ "$t" == -* ]] && continue            # flags: -u, -f, --force, --force-with-lease=…
  if [[ $remote_seen -eq 0 ]]; then
    remote_seen=1                          # first non-flag token = remote (origin/url)
    continue
  fi
  dest="${t##*:}"                          # dest side of a src:dest refspec
  dest="${dest#refs/heads/}"               # strip refs/heads/
  [[ "$dest" == "HEAD" || "$dest" == "@" ]] && dest="$(current_branch)"
  [[ -n "$dest" ]] && targets+=("$dest")
done

# No explicit refspec → push targets the current branch.
if [[ ${#targets[@]} -eq 0 ]]; then
  cur="$(current_branch)"
  [[ -n "$cur" ]] && targets+=("$cur")
fi

# Fail-closed: nothing resolved.
if [[ ${#targets[@]} -eq 0 ]]; then
  emit deny "Could not determine the git push target ref — blocking per the deploy-branch floor (.claude/rules/19-git-and-autonomy.md). Push manually with the ! prefix if intended."
fi

for b in "${targets[@]}"; do
  if [[ "$b" =~ $tag_re ]]; then
    emit deny "Refusing to push release tag '$b' — v* tags fire the irreversible 3-OS Electron release (release.yml). The operator cuts releases (.claude/rules/19-git-and-autonomy.md)."
  fi
  if [[ "$b" =~ $deny_branch_re ]]; then
    emit deny "Refusing to push deploy branch '$b' — main auto-deploys to pulldash.com via Vercel (.claude/rules/19-git-and-autonomy.md). The operator pushes main; agents open a PR and stop."
  fi
done

emit allow "Feature/working branch push (${targets[*]}) — allowed per branch-bounded git safety (.claude/rules/19-git-and-autonomy.md)."
