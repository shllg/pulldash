import { memo, useCallback, useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { SelectedLineRange, DiffLineAnnotation } from "@pierre/diffs";
import type { PullRequestFile, ReviewComment } from "@/api/types";
import {
  type DiffViewMode,
  type LocalPendingComment,
  usePRReviewStore,
  usePRReviewSelector,
  useCurrentFileComments,
  useCurrentFilePendingComments,
} from "@/browser/contexts/pr-review";
import { usePierreFileDiff } from "@/browser/contexts/pr-review/usePierreFileDiff";
import {
  buildCommentAnnotations,
  type PierreCommentAnnotation,
} from "@/browser/lib/pierre-annotations";
import {
  storeToPierreSelection,
  pierreRangeToStore,
} from "@/browser/lib/pierre-selection";
import {
  CommentThread,
  PendingCommentItem,
  InlineCommentForm,
} from "./pr-review";

/**
 * Each annotation subscribes to its own focus/edit ids from the store, so
 * `renderPierreAnnotation` stays a stable module-level function — a comment
 * gaining focus re-renders only its own thread, not every `<FileDiff>` row.
 */
function ThreadAnnotation({ comments }: { comments: ReviewComment[] }) {
  const focusedCommentId = usePRReviewSelector((s) => s.focusedCommentId);
  const editingCommentId = usePRReviewSelector((s) => s.editingCommentId);
  const replyingToCommentId = usePRReviewSelector((s) => s.replyingToCommentId);
  return (
    <CommentThread
      comments={comments}
      focusedCommentId={focusedCommentId}
      editingCommentId={editingCommentId}
      replyingToCommentId={replyingToCommentId}
    />
  );
}

function PendingAnnotation({ comment }: { comment: LocalPendingComment }) {
  const focusedPendingCommentId = usePRReviewSelector(
    (s) => s.focusedPendingCommentId
  );
  const editingPendingCommentId = usePRReviewSelector(
    (s) => s.editingPendingCommentId
  );
  return (
    <PendingCommentItem
      comment={comment}
      isFocused={focusedPendingCommentId === comment.id}
      isEditing={editingPendingCommentId === comment.id}
    />
  );
}

function renderPierreAnnotation(
  annotation: DiffLineAnnotation<PierreCommentAnnotation>
) {
  const meta = annotation.metadata;
  switch (meta.kind) {
    case "thread":
      return <ThreadAnnotation comments={meta.comments} />;
    case "pending":
      return <PendingAnnotation comment={meta.comment} />;
    case "form":
      return <InlineCommentForm line={meta.line} startLine={meta.startLine} />;
  }
}

/**
 * Diff pane rendered by the `@pierre/diffs` engine (behind `?engine=pierre`).
 *
 * Phase 3 parity: inline comments are Pierre line annotations that reuse the
 * existing comment components; line selection paints live from local drag state
 * and commits to the store on selection-end; the gutter "+" starts a comment.
 * Skip-block expansion is native because the diff is built from full file
 * contents (`isPartial: false`).
 *
 * Deferred (see #3): the worker pool (`disableWorkerPool` keeps highlight
 * self-contained; a single desktop file highlights fine on the main thread) and
 * the cutover that makes this the default and deletes the legacy renderer.
 */
export const PierreDiffPane = memo(function PierreDiffPane({
  file,
  viewMode,
}: {
  file: PullRequestFile;
  viewMode: DiffViewMode;
}) {
  const store = usePRReviewStore();
  const { fileDiff, isLoading, error } = usePierreFileDiff(file);

  // File-scoped so comments never bleed across files that share a line number.
  const comments = useCurrentFileComments();
  const pendingComments = useCurrentFilePendingComments();
  const commentingOnLine = usePRReviewSelector((s) => s.commentingOnLine);
  const focusedLine = usePRReviewSelector((s) => s.focusedLine);
  const focusedLineSide = usePRReviewSelector((s) => s.focusedLineSide);
  const selectionAnchor = usePRReviewSelector((s) => s.selectionAnchor);
  const selectionAnchorSide = usePRReviewSelector((s) => s.selectionAnchorSide);

  const lineAnnotations = useMemo(
    () => buildCommentAnnotations(comments, pendingComments, commentingOnLine),
    [comments, pendingComments, commentingOnLine]
  );

  const storeSelectedLines = useMemo<SelectedLineRange | null>(
    () =>
      storeToPierreSelection({
        focusedLine,
        focusedLineSide,
        selectionAnchor,
        selectionAnchorSide,
      }),
    [focusedLine, focusedLineSide, selectionAnchor, selectionAnchorSide]
  );

  // During an active drag we paint the live range from LOCAL state (`undefined`
  // = not dragging → fall back to the store-derived selection). Under Pierre's
  // controlled `selectedLines`, the live highlight comes from the prop, so this
  // keeps drag feedback live without writing to the store on every pointermove;
  // the store (and its broadcast) is touched only once, on commit. Keyboard /
  // external selection still flows in via the store.
  const [dragRange, setDragRange] = useState<
    SelectedLineRange | null | undefined
  >(undefined);
  const selectedLines =
    dragRange !== undefined ? dragRange : storeSelectedLines;

  const onLineSelectionChange = useCallback(
    (range: SelectedLineRange | null) => {
      setDragRange(range);
    },
    []
  );

  const onLineSelected = useCallback(
    (range: SelectedLineRange | null) => {
      setDragRange(undefined); // hand control back to the store-derived value
      const w = pierreRangeToStore(range);
      store.setFocusedLine(w.focusedLine, w.focusedLineSide);
      store.setSelectionAnchor(w.selectionAnchor, w.selectionAnchorSide);
    },
    [store]
  );

  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      store.startCommenting(
        range.end,
        range.start !== range.end ? range.start : undefined
      );
    },
    [store]
  );

  const options = useMemo(
    () => ({
      diffStyle: viewMode,
      theme: "one-light" as const,
      preferredHighlighter: "shiki-js" as const,
      enableLineSelection: true,
      onLineSelectionChange,
      onLineSelected,
      enableGutterUtility: true,
      onGutterUtilityClick,
    }),
    [viewMode, onLineSelectionChange, onLineSelected, onGutterUtilityClick]
  );

  if (!fileDiff) {
    if (isLoading) {
      return (
        <div className="p-4 text-sm text-muted-foreground">Loading diff…</div>
      );
    }
    if (error) {
      return (
        <div className="p-4 text-sm text-destructive text-center flex-1 flex items-center justify-center">
          {error}
        </div>
      );
    }
    return (
      <div className="p-4 text-sm text-muted-foreground text-center flex-1 flex items-center justify-center">
        {!file.patch
          ? "Binary file or file too large to display"
          : "No changes to display"}
      </div>
    );
  }

  if (fileDiff.hunks.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center flex-1 flex items-center justify-center">
        No changes to display
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <FileDiff<PierreCommentAnnotation>
        key={file.filename}
        fileDiff={fileDiff}
        disableWorkerPool
        options={options}
        lineAnnotations={lineAnnotations}
        selectedLines={selectedLines}
        renderAnnotation={renderPierreAnnotation}
      />
    </div>
  );
});
