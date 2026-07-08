import type { DiffLineAnnotation, AnnotationSide } from "@pierre/diffs";
import type { ReviewComment } from "@/api/types";
import type {
  LocalPendingComment,
  CommentingOnLine,
} from "@/browser/contexts/pr-review";

/**
 * Payload carried on each Pierre `DiffLineAnnotation`. `PierreDiffPane`'s
 * `renderAnnotation` switches on `kind` to render the matching (existing)
 * comment component.
 */
export type PierreCommentAnnotation =
  | { kind: "thread"; threadKey: string; comments: ReviewComment[] }
  | { kind: "pending"; comment: LocalPendingComment }
  | { kind: "form"; line: number; startLine?: number };

type Annotation = DiffLineAnnotation<PierreCommentAnnotation>;

function reviewCommentLine(c: ReviewComment): number | null {
  return c.line ?? c.original_line ?? null;
}

function ghSideToPierre(side: string | null | undefined): AnnotationSide {
  return side === "LEFT" ? "deletions" : "additions";
}

/**
 * Build Pierre line annotations from the store's comment state, mirroring the
 * legacy renderer's grouping:
 *  - review comments are threaded by `in_reply_to_id` (root + its replies) and
 *    anchored at `line ?? original_line`,
 *  - unsubmitted pending comments render at their own line,
 *  - the active inline compose form renders at `commentingOnLine`.
 *
 * Pure — no store/React — so it is unit-testable at the data layer.
 */
export function buildCommentAnnotations(
  comments: ReviewComment[],
  pendingComments: LocalPendingComment[],
  commentingOnLine: CommentingOnLine | null
): Annotation[] {
  const annotations: Annotation[] = [];

  // Thread review comments: roots (no in_reply_to_id) + their replies.
  const roots: ReviewComment[] = [];
  const repliesByRoot = new Map<number, ReviewComment[]>();
  for (const c of comments) {
    if (c.in_reply_to_id) {
      const list = repliesByRoot.get(c.in_reply_to_id) ?? [];
      list.push(c);
      repliesByRoot.set(c.in_reply_to_id, list);
    } else {
      roots.push(c);
    }
  }
  for (const root of roots) {
    const line = reviewCommentLine(root);
    if (line == null) continue;
    annotations.push({
      side: ghSideToPierre(root.side),
      lineNumber: line,
      metadata: {
        kind: "thread",
        threadKey: String(root.id),
        comments: [root, ...(repliesByRoot.get(root.id) ?? [])],
      },
    });
  }

  // Unsubmitted pending comments.
  for (const pc of pendingComments) {
    annotations.push({
      side: ghSideToPierre(pc.side),
      lineNumber: pc.line,
      metadata: { kind: "pending", comment: pc },
    });
  }

  // Active inline compose form (store models it without a side → additions).
  if (commentingOnLine) {
    annotations.push({
      side: "additions",
      lineNumber: commentingOnLine.line,
      metadata: {
        kind: "form",
        line: commentingOnLine.line,
        startLine: commentingOnLine.startLine,
      },
    });
  }

  return annotations;
}
