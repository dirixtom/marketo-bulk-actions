import { describe, expect, it } from "vitest";
import { runTestCli } from "./test-support/run-cli.ts";

const campaigns = [{ id: 1692, name: "Send Invite" }];

describe("command line flags", () => {
  it.each([
    ["an unknown flag", ["campaigns:activate", "--instance=sec", "--campaign=1692", "--force"], "--force"],
    ["a missing --instance", ["campaigns:activate", "--campaign=1692"], "--instance is required"],
    ["no campaign references", ["campaigns:activate", "--instance=sec"], "No campaign references"],
    ["an unknown command", ["campaigns:archive", "--instance=sec", "--campaign=1692"], "Unknown command"],
  ])("exits 2 without calling Marketo on %s", async (_, argv, message) => {
    const run = await runTestCli(argv, { marketo: { campaigns } });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(message);
    expect(run.fake.requests).toHaveLength(0);
  });
});
