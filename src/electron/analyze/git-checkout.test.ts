import { test, expect } from "bun:test";
import {
  repoDirFor,
  selectEvictions,
  isSafeRepoComponent,
  withRepoLock,
} from "./git-checkout";

test("repoDirFor nests under reposRoot/owner/repo", () => {
  expect(repoDirFor("/data/repos", "acme", "widgets")).toBe(
    "/data/repos/acme/widgets"
  );
});

test("selectEvictions keeps the newest `max` repos plus the active one", () => {
  const entries = [
    { path: "/r/a", mtimeMs: 100 },
    { path: "/r/b", mtimeMs: 200 },
    { path: "/r/c", mtimeMs: 300 },
    { path: "/r/d", mtimeMs: 400 },
  ];

  // Keep 2 most-recent (d, c) + never evict the active repo (a).
  const evicted = selectEvictions(entries, 2, "/r/a");
  expect(evicted.sort()).toEqual(["/r/b"]);
});

test("selectEvictions never evicts the kept path even if it is oldest", () => {
  const entries = [
    { path: "/r/old", mtimeMs: 1 },
    { path: "/r/new1", mtimeMs: 10 },
    { path: "/r/new2", mtimeMs: 20 },
  ];
  const evicted = selectEvictions(entries, 1, "/r/old");
  expect(evicted).not.toContain("/r/old");
});

test("selectEvictions returns nothing under the cap", () => {
  const entries = [{ path: "/r/a", mtimeMs: 1 }];
  expect(selectEvictions(entries, 8, "/r/a")).toEqual([]);
});

test("isSafeRepoComponent accepts identifiers and rejects path traversal", () => {
  expect(isSafeRepoComponent("acme")).toBe(true);
  expect(isSafeRepoComponent("my-repo.js")).toBe(true);
  expect(isSafeRepoComponent("a_b-c")).toBe(true);
  expect(isSafeRepoComponent("..")).toBe(false);
  expect(isSafeRepoComponent("a/b")).toBe(false);
  expect(isSafeRepoComponent("../etc")).toBe(false);
  expect(isSafeRepoComponent("a..b")).toBe(false);
  expect(isSafeRepoComponent("")).toBe(false);
});

test("withRepoLock serializes tasks on the same dir", async () => {
  const order: string[] = [];
  const a = withRepoLock("/d", async () => {
    order.push("a:start");
    await Promise.resolve();
    await Promise.resolve();
    order.push("a:end");
  });
  const b = withRepoLock("/d", async () => {
    order.push("b:start");
    order.push("b:end");
  });
  await Promise.all([a, b]);
  // b must not start until a fully finished.
  expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
});

test("withRepoLock runs different dirs concurrently and returns values", async () => {
  const [x, y] = await Promise.all([
    withRepoLock("/x", async () => "x-done"),
    withRepoLock("/y", async () => "y-done"),
  ]);
  expect([x, y]).toEqual(["x-done", "y-done"]);
});
