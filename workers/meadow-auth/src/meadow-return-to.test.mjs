import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeReturnToForMeadow } from "./meadow-return-to.mjs";

test("removes repo params from return_to", () => {
  const result = sanitizeReturnToForMeadow(
    "https://hayatotoyoda.github.io/githubToGallery/meadow/?user=octocat&repo=owner/name&r=x"
  );

  assert.equal(
    result,
    "https://hayatotoyoda.github.io/githubToGallery/meadow/?user=octocat"
  );
});

test("preserves non-meadow urls as-is", () => {
  const result = sanitizeReturnToForMeadow(
    "https://hayatotoyoda.github.io/githubToGallery/"
  );

  assert.equal(result, "https://hayatotoyoda.github.io/githubToGallery/");
});

test("removes repo params when meadow path has no trailing slash", () => {
  const result = sanitizeReturnToForMeadow(
    "https://hayatotoyoda.github.io/githubToGallery/meadow?user=octocat&repo=owner/name"
  );

  assert.equal(
    result,
    "https://hayatotoyoda.github.io/githubToGallery/meadow?user=octocat"
  );
});
