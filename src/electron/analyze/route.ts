// Electron-only Hono route: POST /internal/analyze. Streams progress over SSE
// while it checks out the PR head and runs codex, then emits the parsed result.
// Lives here (NOT in shared src/api/api.ts) so it never ships to the Vercel/node
// targets where the local checkout + codex CLI don't exist.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  ensureCheckout,
  repoDirFor,
  withRepoLock,
  isSafeRepoComponent,
} from "./git-checkout";
import { runCodex } from "./codex";
import { buildAnalysisPrompt, type AnalysisFileInput } from "./prompt";
import { parseCodexAnalysis } from "./parse";
import type { PRAnalysis } from "@/browser/contexts/pr-review";

// Custom header the renderer sends. A cross-origin "simple" request cannot set
// it without a CORS preflight, which this server never approves — so requiring
// it blocks drive-by POSTs from any web page open on the machine.
export const ANALYZE_CSRF_HEADER = "x-pulldash-analyze";

export interface AnalyzeRequest {
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
  // The user's GitHub token, used only for the ephemeral clone auth header.
  token: string;
  files: AnalysisFileInput[];
}

export type AnalyzeEvent =
  | { type: "progress"; message: string }
  | { type: "done"; analysis: PRAnalysis }
  | { type: "error"; message: string };

interface AnalyzeRouteConfig {
  reposRoot: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function isValidRequest(body: unknown): body is AnalyzeRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    isNonEmptyString(b.owner) &&
    isNonEmptyString(b.repo) &&
    // owner/repo become filesystem path segments — reject traversal/odd chars.
    isSafeRepoComponent(b.owner) &&
    isSafeRepoComponent(b.repo) &&
    isNonEmptyString(b.baseSha) &&
    isNonEmptyString(b.headSha) &&
    isNonEmptyString(b.token) &&
    Array.isArray(b.files)
  );
}

export function createAnalyzeRoute(config: AnalyzeRouteConfig): Hono {
  const app = new Hono();

  app.post("/analyze", (c) => {
    if (c.req.header(ANALYZE_CSRF_HEADER) !== "1") {
      return c.json({ error: "forbidden" }, 403);
    }

    return streamSSE(c, async (stream) => {
      const emit = (event: AnalyzeEvent) =>
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        await emit({ type: "error", message: "Invalid request body" });
        return;
      }

      if (!isValidRequest(body)) {
        await emit({ type: "error", message: "Malformed analyze request" });
        return;
      }

      const { owner, repo, baseSha, headSha, token, files } = body;
      const signal = c.req.raw.signal;
      const onProgress = (message: string) => {
        void emit({ type: "progress", message });
      };

      onProgress("Preparing…");
      const dir = repoDirFor(config.reposRoot, owner, repo);

      try {
        // Serialize checkout+codex per repo dir so a concurrent analysis of a
        // different PR in the same repo can't re-point the working tree mid-run.
        await withRepoLock(dir, async () => {
          const repoDir = await ensureCheckout({
            reposRoot: config.reposRoot,
            owner,
            repo,
            baseSha,
            headSha,
            token,
            onProgress,
            signal,
          });

          const prompt = buildAnalysisPrompt({
            owner,
            repo,
            baseSha,
            headSha,
            files,
          });
          const raw = await runCodex({ repoDir, prompt, onProgress, signal });
          const analysis = parseCodexAnalysis(raw, files);
          await emit({ type: "done", analysis });
        });
      } catch (err) {
        if (signal.aborted) return; // client navigated away; nothing to report
        await emit({
          type: "error",
          message: err instanceof Error ? err.message : "Analysis failed",
        });
      }
    });
  });

  return app;
}
