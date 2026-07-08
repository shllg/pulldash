import { useEffect, useState } from "react";
import type { PullRequestFile } from "@/api/types";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useGitHub } from "@/browser/contexts/github";
import { buildPierreFileDiff } from "@/browser/lib/pierre-diff";
import { usePRReviewSelector } from ".";

interface PierreFileDiffResult {
  fileDiff: FileDiffMetadata | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Experimental loader for the `@pierre/diffs` engine (behind `?engine=pierre`).
 *
 * Mirrors `useDiffLoader`'s content-fetch shape — old side from `base.sha`, new
 * side from `head.sha`, empty for add/remove — then builds Pierre's
 * `FileDiffMetadata` via the pure `buildPierreFileDiff` adapter. `getFileContent`
 * is cached in the GitHub context, so this reuses whatever the legacy loader
 * already fetched.
 *
 * Prototype-scoped: it keeps the derived diff in local state rather than
 * expanding the store schema, so the default (legacy) path is untouched.
 */
export function usePierreFileDiff(
  file: PullRequestFile | null
): PierreFileDiffResult {
  const github = useGitHub();
  const owner = usePRReviewSelector((s) => s.owner);
  const repo = usePRReviewSelector((s) => s.repo);
  const pr = usePRReviewSelector((s) => s.pr);

  const [state, setState] = useState<PierreFileDiffResult>({
    fileDiff: null,
    isLoading: false,
    error: null,
  });

  const filename = file?.filename ?? null;
  const status = file?.status;
  const previousFilename = file?.previous_filename;
  const hasPatch = !!file?.patch;

  useEffect(() => {
    if (!filename || !hasPatch) {
      setState({ fileDiff: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ fileDiff: null, isLoading: true, error: null });

    (async () => {
      try {
        // `""` is the *legitimate* absence of a side (added → no base, removed →
        // no head); only those cases short-circuit. A real fetch failure
        // (network / rate-limit / auth) must propagate so we surface an error
        // rather than coercing to "" and rendering a misleading whole-file diff.
        const [oldContent, newContent] = await Promise.all([
          status === "added"
            ? Promise.resolve("")
            : github.getFileContent(
                owner,
                repo,
                previousFilename || filename,
                pr.base.sha
              ),
          status === "removed"
            ? Promise.resolve("")
            : github.getFileContent(owner, repo, filename, pr.head.sha),
        ]);
        if (cancelled) return;

        const fileDiff = buildPierreFileDiff(
          {
            filename,
            status,
            previous_filename: previousFilename,
          } as PullRequestFile,
          oldContent,
          newContent
        );
        setState({ fileDiff, isLoading: false, error: null });
      } catch {
        if (cancelled) return;
        setState({
          fileDiff: null,
          isLoading: false,
          error: "Failed to load file contents",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    filename,
    status,
    previousFilename,
    hasPatch,
    github,
    owner,
    repo,
    pr.base.sha,
    pr.head.sha,
  ]);

  return state;
}
