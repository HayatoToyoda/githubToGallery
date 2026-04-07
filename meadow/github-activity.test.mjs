import test from "node:test";
import assert from "node:assert/strict";
import { resolveGithubActivity } from "./github-activity.js";

test("ignores repo query and resolves activity from user only", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const text = String(url);

    if (text.includes("/users/octocat/repos")) {
      return Response.json([
        {
          name: "octocat",
          owner: { login: "octocat" },
          fork: false,
        },
      ]);
    }

    if (text.includes("/repos/octocat/octocat/stats/contributors")) {
      return Response.json([
        {
          total: 7,
          author: { login: "octocat" },
        },
      ]);
    }

    throw new Error(`unexpected url: ${text}`);
  };

  try {
    const activity = await resolveGithubActivity(
      new URLSearchParams("user=octocat&repo=owner/name")
    );

    assert.equal(activity.commitCount, 7);
    assert.equal(activity.source, "auto_user");
    assert.match(activity.label, /octocat/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
