import { test, expect } from "bun:test";
import type { PullRequestFile } from "@/api/types";
import type { AnalysisGroup } from "@/browser/contexts/pr-review";
import { buildTopicsFlat, filesForTopic, OTHER_GROUP_ID } from "./file-tree";

function file(
  filename: string,
  additions = 10,
  deletions = 5
): PullRequestFile {
  return {
    sha: "x",
    filename,
    status: "modified",
    additions,
    deletions,
    changes: additions + deletions,
    patch: "",
  } as PullRequestFile;
}

function group(id: string, filenames: string[]): AnalysisGroup {
  return {
    id,
    title: id.toUpperCase(),
    description: `${id} desc`,
    impact: `${id} impact`,
    filenames,
    additions: 0,
    deletions: 0,
  };
}

const isGroup = (i: ReturnType<typeof buildTopicsFlat>[number]) => "group" in i;

test("buildTopicsFlat emits a header then its file rows with rolled-up +/-", () => {
  const files = [
    file("src/db/schema.ts", 20, 4),
    file("src/db/migrate.ts", 6, 0),
  ];
  const flat = buildTopicsFlat(
    files,
    [group("db", ["src/db/schema.ts", "src/db/migrate.ts"])],
    new Set(),
    false,
    new Set()
  );

  expect(flat).toHaveLength(3);
  const header = flat[0];
  expect(isGroup(header)).toBe(true);
  if ("group" in header) {
    expect(header.group.title).toBe("DB");
    // rollup computed from PullRequestFile data, not the model's 0s
    expect(header.additions).toBe(26);
    expect(header.deletions).toBe(4);
    expect(header.fileCount).toBe(2);
  }
  // followed by the two file rows
  expect(flat.slice(1).every((i) => !isGroup(i))).toBe(true);
});

test("buildTopicsFlat collapses a group to just its header", () => {
  const files = [file("a.ts"), file("b.ts")];
  const flat = buildTopicsFlat(
    files,
    [group("g", ["a.ts", "b.ts"])],
    new Set(),
    false,
    new Set(["g"])
  );

  expect(flat).toHaveLength(1);
  expect(isGroup(flat[0])).toBe(true);
});

test("buildTopicsFlat collects uncovered files into a trailing Other group", () => {
  const files = [file("src/a.ts"), file("README.md")];
  const flat = buildTopicsFlat(
    files,
    [group("code", ["src/a.ts"])],
    new Set(),
    false,
    new Set()
  );

  // code header + a.ts + Other header + README.md
  const headers = flat.filter(isGroup);
  expect(headers).toHaveLength(2);
  const other = headers[1];
  if ("group" in other) {
    expect(other.group.id).toBe("__other__");
    expect(other.group.title).toBe("Other changes");
  }
  // Every file appears exactly once as a row.
  const rows = flat.filter((i) => !isGroup(i));
  expect(rows).toHaveLength(2);
});

test("buildTopicsFlat drops a group whose files are all viewed when hideViewed", () => {
  const files = [file("a.ts"), file("b.ts")];
  const flat = buildTopicsFlat(
    files,
    [group("g", ["a.ts", "b.ts"])],
    new Set(["a.ts", "b.ts"]),
    true,
    new Set()
  );

  expect(flat).toHaveLength(0);
});

test("buildTopicsFlat hides only viewed file rows but keeps a partly-viewed group", () => {
  const files = [file("a.ts"), file("b.ts")];
  const flat = buildTopicsFlat(
    files,
    [group("g", ["a.ts", "b.ts"])],
    new Set(["a.ts"]),
    true,
    new Set()
  );

  // header + only the unviewed b.ts row
  expect(flat).toHaveLength(2);
  const rows = flat.filter((i) => !isGroup(i));
  expect(rows).toHaveLength(1);
  if (!("group" in rows[0])) {
    expect(rows[0].node.path).toBe("b.ts");
  }
});

test("buildTopicsFlat never duplicates a file shared across group filename lists", () => {
  const files = [file("shared.ts"), file("only-b.ts")];
  const flat = buildTopicsFlat(
    files,
    [group("a", ["shared.ts"]), group("b", ["shared.ts", "only-b.ts"])],
    new Set(),
    false,
    new Set()
  );

  const rows = flat.filter((i) => !isGroup(i));
  const paths = rows.map((i) => ("group" in i ? "" : i.node.path));
  // shared.ts claimed by group a; group b only gets only-b.ts
  expect(paths.filter((p) => p === "shared.ts")).toHaveLength(1);
});

test("buildTopicsFlat skips a viewed topic under hideViewed but keeps it otherwise", () => {
  const files = [file("a.ts"), file("b.ts")];
  const groups = [group("g", ["a.ts", "b.ts"])];

  // hideViewed + topic marked viewed → the whole group is skipped.
  expect(
    buildTopicsFlat(files, groups, new Set(), true, new Set(), new Set(["g"]))
  ).toHaveLength(0);

  // hideViewed off → the viewed topic still renders (header + 2 rows).
  expect(
    buildTopicsFlat(files, groups, new Set(), false, new Set(), new Set(["g"]))
  ).toHaveLength(3);
});

test("filesForTopic returns a group's files in group-member order", () => {
  const files = [file("a.ts"), file("b.ts"), file("c.ts")];
  const groups = [group("g", ["b.ts", "a.ts"])];
  expect(filesForTopic("g", groups, files).map((f) => f.filename)).toEqual([
    "b.ts",
    "a.ts",
  ]);
});

test("filesForTopic resolves the synthetic Other bucket to unclaimed files", () => {
  const files = [file("src/a.ts"), file("README.md")];
  const groups = [group("code", ["src/a.ts"])];
  expect(
    filesForTopic(OTHER_GROUP_ID, groups, files).map((f) => f.filename)
  ).toEqual(["README.md"]);
});
