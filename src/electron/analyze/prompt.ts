// Pure prompt + output-contract builder for the codex analysis run.
// No Node/Electron imports — safe to unit-test in bun.

export interface AnalysisFileInput {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface AnalysisPromptInput {
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
  files: AnalysisFileInput[];
}

// JSON Schema passed to `codex exec --output-schema`. Intentionally omits the
// per-group additions/deletions — those are rolled up from PullRequestFile data
// on our side (never trusted from the model). Kept in sync with parse.ts.
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          impact: { type: "string" },
          filenames: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "description", "impact", "filenames"],
      },
    },
    fileMeta: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          risk: { type: "string", enum: ["low", "medium", "high"] },
          complexity: { type: "string", enum: ["low", "medium", "high"] },
          summary: { type: "string" },
        },
        required: ["risk", "complexity", "summary"],
      },
    },
  },
  required: ["groups", "fileMeta"],
} as const;

/**
 * Build the instruction prompt for `codex exec`. Codex runs inside a checkout of
 * the PR head, so it can read full file contents and compute the diff itself
 * from the base..head SHAs. The prompt constrains it to the listed changed
 * filenames and to the JSON output contract enforced by --output-schema.
 */
export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const { owner, repo, baseSha, headSha, files } = input;

  const fileList = files
    .map(
      (f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`
    )
    .join("\n");

  return `You are reviewing a GitHub pull request for ${owner}/${repo}.

The repository is checked out at the PR head commit ${headSha}. The PR base is ${baseSha}.
Inspect the change with: \`git diff ${baseSha} ${headSha}\` and read files as needed for context.

There are ${files.length} changed file(s):
${fileList}

Group these files into a small number of meaningful SEMANTIC topics (e.g. "UI", "Database",
"API/controllers", "Build/CI", "Tests", "Docs"). Each topic gets a short plain-language
description and an "impact" note (what a reviewer should watch for). Also produce per-file
metadata: a risk level, a complexity level, and a one-line summary of what changed.

Rules:
- Only reference filenames from the list above — never invent paths.
- Every changed file should belong to exactly one group.
- Prefer 2–6 groups; do not create a group per file.
- "risk" and "complexity" are each exactly one of: "low", "medium", "high".
- Keep descriptions/summaries concise (one sentence).

Respond with ONLY a JSON object matching the required schema — no prose, no code fences.`;
}
