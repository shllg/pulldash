import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs";
import type { PullRequestFile } from "@/api/types";

/**
 * Pure adapter: build a `@pierre/diffs` `FileDiffMetadata` from a GitHub PR
 * file entry plus its fetched old/new full contents.
 *
 * This is the seam the experimental Pierre diff engine renders from. It is kept
 * pure (no fetch, no React, no worker) so it can be unit-tested at the data
 * layer. Content fetching lives in `usePierreFileDiff`.
 *
 * We feed full file contents (not the GitHub `.patch`) because Pierre derives
 * the diff itself via jsdiff, which yields `isPartial: false` metadata — that
 * is what unlocks hunk expansion and whole-file syntax highlighting.
 */
export function buildPierreFileDiff(
  file: PullRequestFile,
  oldContent: string,
  newContent: string
): FileDiffMetadata {
  // On a rename the old side is addressed by the previous path.
  const oldName = file.previous_filename || file.filename;
  return parseDiffFromFile(
    { name: oldName, contents: oldContent },
    { name: file.filename, contents: newContent }
  );
}
