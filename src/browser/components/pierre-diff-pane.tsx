import { memo } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { PullRequestFile } from "@/api/types";
import type { DiffViewMode } from "@/browser/contexts/pr-review";
import { usePierreFileDiff } from "@/browser/contexts/pr-review/usePierreFileDiff";

/**
 * Experimental diff pane rendered by the `@pierre/diffs` engine (behind
 * `?engine=pierre`). Phase 0–2 of the migration: renders a single file's diff
 * to validate the engine end-to-end. Comments, selection, and keyboard-nav
 * parity are intentionally NOT wired here — those are follow-up phases.
 *
 * `disableWorkerPool` keeps this self-contained (main-thread Shiki highlight)
 * until the worker pool is wired for the Electron renderer in a later slice.
 */
export const PierreDiffPane = memo(function PierreDiffPane({
  file,
  viewMode,
}: {
  file: PullRequestFile;
  viewMode: DiffViewMode;
}) {
  const { fileDiff, isLoading } = usePierreFileDiff(file);

  if (!fileDiff) {
    if (isLoading) {
      return (
        <div className="p-4 text-sm text-muted-foreground">Loading diff…</div>
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
      <FileDiff
        key={file.filename}
        fileDiff={fileDiff}
        disableWorkerPool
        options={{
          diffStyle: viewMode,
          theme: "one-light",
          preferredHighlighter: "shiki-js",
        }}
      />
    </div>
  );
});
