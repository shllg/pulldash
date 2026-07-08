#!/usr/bin/env bash
# Resolve a PR review thread by its GraphQL thread id.
# Usage: ./scripts/resolve_pr_comment.sh <thread_id> [<thread_id> ...]
#
# Thread ids are printed by check_pr_reviews.sh and check_codex_comments.sh
# (they look like PRRT_kw...). This wraps the resolveReviewThread GraphQL
# mutation so the review-resolution loop those scripts describe actually works.
#
# Exits 0 if all threads resolved, 1 on any failure.

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <thread_id> [<thread_id> ...]" >&2
  echo "" >&2
  echo "Thread ids come from ./scripts/check_pr_reviews.sh or check_codex_comments.sh" >&2
  exit 1
fi

FAILED=0

for THREAD_ID in "$@"; do
  echo "Resolving thread ${THREAD_ID}..."
  if gh api graphql \
    -f query='mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { id isResolved }
      }
    }' \
    -F threadId="$THREAD_ID" \
    --jq '.data.resolveReviewThread.thread | "  \(.id) isResolved=\(.isResolved)"'; then
    echo "✅ Resolved ${THREAD_ID}"
  else
    echo "❌ Failed to resolve ${THREAD_ID}" >&2
    FAILED=1
  fi
done

exit $FAILED
