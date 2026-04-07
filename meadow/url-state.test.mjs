import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMeadowUrlSearch } from "./url-state.js";

test("drops repo params and keeps user query", () => {
  const result = normalizeMeadowUrlSearch("?user=octocat&repo=owner/name&r=x");
  assert.equal(result, "?user=octocat");
});

test("uses short user alias when full user is missing", () => {
  const result = normalizeMeadowUrlSearch("?u=hayato&repo=foo/bar");
  assert.equal(result, "?user=hayato");
});

test("returns empty string when no user query exists", () => {
  const result = normalizeMeadowUrlSearch("?repo=foo/bar");
  assert.equal(result, "");
});

test("preserves noRotate while removing repo params", () => {
  const result = normalizeMeadowUrlSearch("?user=octocat&repo=foo/bar&noRotate=1");
  assert.equal(result, "?user=octocat&noRotate=1");
});
