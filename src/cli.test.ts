import { describe, expect, it } from "vitest";
import { runTestCli } from "./test-support/run-cli.ts";

const campaigns = [{ id: 1692, name: "Send Invite" }];

describe("command line flags", () => {
  it.each([
    ["an unknown flag", ["campaigns:activate", "--instance=sec", "--campaign=1692", "--force"], "--force"],
    ["a missing --instance", ["campaigns:activate", "--campaign=1692"], "--instance is required"],
    ["no campaign references", ["campaigns:activate", "--instance=sec"], "No campaign references"],
    ["an unknown command", ["campaigns:archive", "--instance=sec", "--campaign=1692"], "Unknown command"],
    [
      "--workspace",
      ["campaigns:activate", "--instance=sec", "--campaign=1692", "--workspace=Default"],
      "--workspace is not yet supported",
    ],
  ])("exits 2 without calling Marketo on %s", async (_, argv, message) => {
    const run = await runTestCli(argv, { marketo: { campaigns } });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(message);
    expect(run.fake.requests).toHaveLength(0);
  });

  it("fails references that are not numeric IDs as not yet supported, and acts on the rest", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=Webinar.01 - Send Invite", "--campaign=1692", "--yes"],
      { marketo: { campaigns } },
    );

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(
      /^failed\s+Webinar\.01 - Send Invite \(campaign names are not yet supported, use the numeric ID\)$/m,
    );
    expect(run.stdout).toMatch(/^done\s+1692 Send Invite$/m);
  });
});
