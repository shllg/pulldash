import { useCallback, useEffect, useRef } from "react";
import { useGitHub } from "@/browser/contexts/github";
import { useAuth } from "@/browser/contexts/auth";
import { isElectron } from "@/browser/lib/platform";
import { usePRReviewStore, usePRReviewSelector, type PRAnalysis } from ".";

// Content-addressed cache key: base+head SHAs encode the exact diff, so a hit is
// always valid for that revision (no TTL). base is included because a retarget
// (or the base branch advancing) can change the diff with head unchanged. Pure +
// exported for testing.
export function analysisCacheKey(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  baseSha: string
): string {
  return `analysis:${owner}/${repo}/${number}:${headSha}:${baseSha}`;
}

// SSE event contract mirrored from the Electron /internal/analyze route.
type AnalyzeEvent =
  | { type: "progress"; message: string }
  | { type: "done"; analysis: PRAnalysis }
  | { type: "error"; message: string };

/**
 * Parse accumulated SSE text into complete events, returning the trailing
 * partial frame as `rest`. Pure + exported so the state machine is testable
 * without a live stream.
 */
export function parseSSEChunk(buffer: string): {
  events: AnalyzeEvent[];
  rest: string;
} {
  const events: AnalyzeEvent[] = [];
  let rest = buffer;
  let boundary = rest.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed.type === "string") {
          events.push(parsed as AnalyzeEvent);
        }
      } catch {
        // Ignore a malformed frame; the stream continues.
      }
    }
    boundary = rest.indexOf("\n\n");
  }
  return { events, rest };
}

/**
 * Drive the semantic-analysis lifecycle: hydrate from cache on open, and expose
 * `startAnalysis` to run codex via the Electron endpoint (Electron-only). All
 * state lives in the store (analysis + status); this hook owns only the async.
 */
export function useAnalysisLoader() {
  const store = usePRReviewStore();
  const github = useGitHub();
  const { token } = useAuth();
  const owner = usePRReviewSelector((s) => s.owner);
  const repo = usePRReviewSelector((s) => s.repo);
  const pr = usePRReviewSelector((s) => s.pr);

  const abortRef = useRef<AbortController | null>(null);
  const headSha = pr.head.sha;
  const baseSha = pr.base.sha;
  const number = pr.number;

  // Hydrate from cache when the PR/revision changes; a new head SHA invalidates
  // any prior analysis (it was for a different revision).
  useEffect(() => {
    // Abort an in-flight run for the previous head so it can't overwrite state.
    abortRef.current?.abort();
    const key = analysisCacheKey(owner, repo, number, headSha, baseSha);
    const cached = github.getPersistentCache<PRAnalysis>(key);
    if (cached) {
      store.setAnalysis(cached);
      store.setAnalysisStatus("done");
    } else {
      store.setAnalysis(null);
      store.setAnalysisStatus("idle");
      store.setGroupByMode("tree");
    }
  }, [owner, repo, number, headSha, baseSha, github, store]);

  // Abort an in-flight run on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const startAnalysis = useCallback(
    async (force = false) => {
      if (!isElectron()) {
        store.setAnalysisStatus(
          "error",
          "Semantic analysis requires the Pulldash desktop app"
        );
        return;
      }
      if (store.getSnapshot().analysisStatus === "running") return;

      const key = analysisCacheKey(owner, repo, number, headSha, baseSha);
      if (!force) {
        const cached = github.getPersistentCache<PRAnalysis>(key);
        if (cached) {
          store.setAnalysis(cached);
          store.setAnalysisStatus("done");
          store.setGroupByMode("topics");
          return;
        }
      }

      if (!token) {
        store.setAnalysisStatus("error", "Sign in to run analysis");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      store.setAnalysisStatus("running");

      try {
        const files = store.getSnapshot().files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        }));

        const res = await fetch("/internal/analyze", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // CSRF guard: the endpoint requires this custom header (a value a
            // cross-origin simple request cannot set without a blocked preflight).
            "x-pulldash-analyze": "1",
          },
          signal: controller.signal,
          body: JSON.stringify({
            owner,
            repo,
            number,
            baseSha,
            headSha,
            token,
            files,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Analyze request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalAnalysis: PRAnalysis | null = null;
        let errorMessage: string | null = null;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSSEChunk(buffer);
          buffer = rest;
          for (const ev of events) {
            if (ev.type === "done") finalAnalysis = ev.analysis;
            else if (ev.type === "error") errorMessage = ev.message;
            // "progress" events keep the running spinner; no store write needed.
          }
        }

        // The PR revision may have moved (new push, branch update, or base
        // retarget) while the run was in flight — discard a result that no
        // longer matches the base+head it was computed against.
        const current = store.getSnapshot().pr;
        if (current.head.sha !== headSha || current.base.sha !== baseSha)
          return;

        if (errorMessage) {
          store.setAnalysisStatus("error", errorMessage);
          return;
        }
        if (!finalAnalysis) {
          store.setAnalysisStatus("error", "Analysis returned no result");
          return;
        }

        github.setPersistentCache(key, finalAnalysis);
        store.setAnalysis(finalAnalysis);
        store.setAnalysisStatus("done");
        store.setGroupByMode("topics");
      } catch (err) {
        if (controller.signal.aborted) return;
        store.setAnalysisStatus(
          "error",
          err instanceof Error ? err.message : "Analysis failed"
        );
      }
    },
    [store, github, token, owner, repo, number, baseSha, headSha]
  );

  return { startAnalysis };
}
