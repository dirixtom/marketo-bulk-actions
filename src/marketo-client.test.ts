import { describe, expect, it } from "vitest";
import { createFakeMarketo } from "./test-support/fake-marketo.ts";
import { runTestCli } from "./test-support/run-cli.ts";

const ACTIVATE_1 = "/rest/asset/v1/smartCampaign/1/activate.json";

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

  it("exits 2 with a clear message when Marketo rejects the credentials", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1", "--yes"], {
      marketo: { clientSecret: "a-different-secret", campaigns: [{ id: 1, name: "One" }] },
    });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("Marketo rejected the credentials for instance sec (HTTP 401)");
    expect(run.fake.restRequests()).toHaveLength(0);
  });
});

describe("Marketo token refresh", () => {
  it.each(["601", "602"])("fetches a new token once on %s and the call succeeds", async (code) => {
    const fake = createFakeMarketo({ campaigns: [{ id: 1, name: "One" }] });
    fake.failWith({ method: "POST", path: ACTIVATE_1, code });

    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1", "--yes"], { fake });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^done\s+1 One$/m);
    expect(fake.tokenRequests()).toHaveLength(2);
    const posts = fake.restRequests().filter((r) => r.method === "POST");
    expect(posts.map((r) => r.authorization)).toEqual(["Bearer fake-token-1", "Bearer fake-token-2"]);
  });

  it("fails the campaign when the new token is refused too", async () => {
    const fake = createFakeMarketo({ campaigns: [{ id: 1, name: "One" }] });
    fake.failWith({ method: "POST", path: ACTIVATE_1, code: "601", times: 2 });

    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1", "--yes"], { fake });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^failed\s+1 One \(Marketo error 601: Access token invalid\)$/m);
    expect(fake.tokenRequests()).toHaveLength(2);
  });
});

describe("Marketo rate and concurrency limits", () => {
  it.each(["606", "615"])("backs off from 2 s and retries a call throttled with %s", async (code) => {
    const fake = createFakeMarketo({ campaigns: [{ id: 1, name: "One" }] });
    fake.failWith({ method: "POST", path: ACTIVATE_1, code, times: 2 });

    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1", "--yes"], { fake });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^done\s+1 One$/m);
    expect(run.sleeps).toEqual([2000, 4000]);
    expect(fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(3);
  });

  it("fails the campaign after 5 throttled attempts and carries on with the rest", async () => {
    const fake = createFakeMarketo({
      campaigns: [
        { id: 1, name: "One" },
        { id: 2, name: "Two" },
      ],
    });
    fake.failWith({ method: "POST", path: ACTIVATE_1, code: "606", times: 5 });

    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=1", "--campaign=2", "--yes"],
      { fake },
    );

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^failed\s+1 One \(Marketo error 606: Max rate limit .*\)$/m);
    expect(run.stdout).toMatch(/^done\s+2 Two$/m);
    expect(run.sleeps).toEqual([2000, 4000, 8000, 16000]);
    expect(fake.restRequests().filter((r) => r.url.pathname === ACTIVATE_1)).toHaveLength(5);
  });
});
