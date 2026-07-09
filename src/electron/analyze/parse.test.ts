import { test, expect } from "bun:test";
import { parseCodexAnalysis, extractJsonObject } from "./parse";

const files = [
  { filename: "src/db/schema.ts", additions: 20, deletions: 4 },
  { filename: "src/db/migrate.ts", additions: 6, deletions: 0 },
  { filename: "src/ui/Button.tsx", additions: 3, deletions: 1 },
];

function validPayload(): string {
  return JSON.stringify({
    groups: [
      {
        id: "db",
        title: "Database",
        description: "schema",
        impact: "migration",
        filenames: ["src/db/schema.ts", "src/db/migrate.ts"],
      },
      {
        id: "ui",
        title: "UI",
        description: "button",
        impact: "visual",
        filenames: ["src/ui/Button.tsx"],
      },
    ],
    fileMeta: {
      "src/db/schema.ts": {
        risk: "high",
        complexity: "medium",
        summary: "adds table",
      },
      "src/ui/Button.tsx": { risk: "low", complexity: "low", summary: "pad" },
    },
  });
}

test("extractJsonObject unwraps ```json fences", () => {
  const raw = 'Here you go:\n```json\n{"groups":[]}\n```\nDone.';
  expect(extractJsonObject(raw)).toBe('{"groups":[]}');
});

test("extractJsonObject slices object out of surrounding prose", () => {
  const raw = 'Sure! {"groups":[],"fileMeta":{}} hope that helps';
  expect(extractJsonObject(raw)).toBe('{"groups":[],"fileMeta":{}}');
});

test("extractJsonObject returns null when there is no object", () => {
  expect(extractJsonObject("no json here")).toBeNull();
});

test("parseCodexAnalysis parses a clean payload and rolls up +/- from files", () => {
  const analysis = parseCodexAnalysis(validPayload(), files);

  expect(analysis.groups.map((g) => g.id)).toEqual(["db", "ui"]);
  const db = analysis.groups[0];
  expect(db.filenames).toEqual(["src/db/schema.ts", "src/db/migrate.ts"]);
  // rolled up from file data, not the model
  expect(db.additions).toBe(26);
  expect(db.deletions).toBe(4);
  expect(analysis.fileMeta["src/db/schema.ts"].risk).toBe("high");
});

test("parseCodexAnalysis reads fileMeta as an array of {filename,...}", () => {
  const raw = JSON.stringify({
    groups: [
      {
        id: "db",
        title: "DB",
        description: "",
        impact: "",
        filenames: ["src/db/schema.ts"],
      },
    ],
    fileMeta: [
      {
        filename: "src/db/schema.ts",
        risk: "high",
        complexity: "low",
        summary: "adds table",
      },
      // hallucinated file in the array is ignored
      { filename: "ghost.ts", risk: "low", complexity: "low", summary: "x" },
    ],
  });
  const analysis = parseCodexAnalysis(raw, files);
  expect(analysis.fileMeta["src/db/schema.ts"].risk).toBe("high");
  expect(analysis.fileMeta["src/db/schema.ts"].summary).toBe("adds table");
  expect(analysis.fileMeta["ghost.ts"]).toBeUndefined();
});

test("parseCodexAnalysis tolerates prose-wrapped, fenced output", () => {
  const raw = "Analysis complete:\n```json\n" + validPayload() + "\n```";
  const analysis = parseCodexAnalysis(raw, files);
  expect(analysis.groups).toHaveLength(2);
});

test("parseCodexAnalysis drops hallucinated filenames and empty groups", () => {
  const raw = JSON.stringify({
    groups: [
      {
        id: "ghost",
        title: "Ghost",
        description: "",
        impact: "",
        filenames: ["nope.ts"],
      },
      {
        id: "real",
        title: "Real",
        description: "",
        impact: "",
        filenames: ["src/ui/Button.tsx"],
      },
    ],
    fileMeta: { "nope.ts": { risk: "high", complexity: "high", summary: "x" } },
  });
  const analysis = parseCodexAnalysis(raw, files);

  // ghost group dropped (no real files); hallucinated fileMeta entry ignored
  expect(analysis.groups.map((g) => g.id)).toEqual(["real"]);
  expect(analysis.fileMeta["nope.ts"]).toBeUndefined();
});

test("parseCodexAnalysis coerces invalid risk/complexity to medium", () => {
  const raw = JSON.stringify({
    groups: [
      {
        id: "g",
        title: "G",
        description: "",
        impact: "",
        filenames: ["src/db/schema.ts"],
      },
    ],
    fileMeta: {
      "src/db/schema.ts": { risk: "catastrophic", complexity: 7, summary: "x" },
    },
  });
  const analysis = parseCodexAnalysis(raw, files);
  expect(analysis.fileMeta["src/db/schema.ts"].risk).toBe("medium");
  expect(analysis.fileMeta["src/db/schema.ts"].complexity).toBe("medium");
});

test("parseCodexAnalysis claims each file for only the first group", () => {
  const raw = JSON.stringify({
    groups: [
      {
        id: "a",
        title: "A",
        description: "",
        impact: "",
        filenames: ["src/db/schema.ts"],
      },
      {
        id: "b",
        title: "B",
        description: "",
        impact: "",
        filenames: ["src/db/schema.ts", "src/db/migrate.ts"],
      },
    ],
    fileMeta: {},
  });
  const analysis = parseCodexAnalysis(raw, files);
  expect(analysis.groups[0].filenames).toEqual(["src/db/schema.ts"]);
  expect(analysis.groups[1].filenames).toEqual(["src/db/migrate.ts"]);
});

test("parseCodexAnalysis throws on non-JSON output (fail-closed)", () => {
  expect(() => parseCodexAnalysis("codex could not comply", files)).toThrow();
});

test("parseCodexAnalysis throws when groups array is missing", () => {
  expect(() =>
    parseCodexAnalysis(JSON.stringify({ fileMeta: {} }), files)
  ).toThrow();
});
