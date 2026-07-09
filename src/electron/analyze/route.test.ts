import { test, expect } from "bun:test";
import { isValidRequest } from "./route";

function base() {
  return {
    owner: "acme",
    repo: "widgets",
    baseSha: "base1",
    headSha: "head1",
    token: "ghs_x",
    files: [],
  };
}

test("isValidRequest accepts a well-formed payload", () => {
  expect(isValidRequest(base())).toBe(true);
});

test("isValidRequest rejects path-traversal owner/repo", () => {
  expect(isValidRequest({ ...base(), owner: "../etc" })).toBe(false);
  expect(isValidRequest({ ...base(), repo: ".." })).toBe(false);
  expect(isValidRequest({ ...base(), repo: "a/b" })).toBe(false);
});

test("isValidRequest rejects missing/empty fields", () => {
  expect(isValidRequest({ ...base(), token: "" })).toBe(false);
  expect(isValidRequest({ ...base(), headSha: undefined })).toBe(false);
  expect(isValidRequest({ ...base(), files: "nope" })).toBe(false);
  expect(isValidRequest(null)).toBe(false);
  expect(isValidRequest("string")).toBe(false);
});
