import { describe, expect, it } from "vitest";
import { runTestCli } from "./test-support/run-cli.ts";

describe("Marketo authentication", () => {
  it("fetches one token per run and sends it only as a Bearer header", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=1", "--campaign=2", "--campaign=3", "--yes"],
      {
        marketo: {
          campaigns: [
            { id: 1, name: "One" },
            { id: 2, name: "Two" },
            { id: 3, name: "Three" },
          ],
        },
      },
    );

    expect(run.exitCode).toBe(0);
    expect(run.fake.tokenRequests()).toHaveLength(1);
    const rest = run.fake.restRequests();
    expect(rest.length).toBeGreaterThan(0);
    for (const request of rest) {
      expect(request.authorization).toBe("Bearer fake-token-1");
      expect(request.url.searchParams.has("access_token")).toBe(false);
    }
  });
});
