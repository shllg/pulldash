import { test, expect } from "bun:test";
import { buildAnalysisPrompt, ANALYSIS_JSON_SCHEMA } from "./prompt";

test("buildAnalysisPrompt embeds SHAs, repo, and every changed filename", () => {
  const prompt = buildAnalysisPrompt({
    owner: "acme",
    repo: "widgets",
    baseSha: "base111",
    headSha: "head222",
    files: [
      { filename: "src/a.ts", status: "modified", additions: 5, deletions: 2 },
      { filename: "src/b.ts", status: "added", additions: 9, deletions: 0 },
    ],
  });

  expect(prompt).toContain("acme/widgets");
  expect(prompt).toContain("base111");
  expect(prompt).toContain("head222");
  expect(prompt).toContain("src/a.ts");
  expect(prompt).toContain("src/b.ts");
  // instructs a diff over base..head
  expect(prompt).toContain("git diff base111 head222");
  // states the file count
  expect(prompt).toContain("2 changed file");
});

test("ANALYSIS_JSON_SCHEMA requires groups and fileMeta", () => {
  expect(ANALYSIS_JSON_SCHEMA.required).toEqual(["groups", "fileMeta"]);
  expect(
    ANALYSIS_JSON_SCHEMA.properties.fileMeta.additionalProperties.properties
      .risk.enum
  ).toEqual(["low", "medium", "high"]);
});
