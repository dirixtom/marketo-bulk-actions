import { describe, expect, it } from "vitest";
import { runTestCli } from "./test-support/run-cli.ts";

describe("activating smart campaigns by ID", () => {
  it("activates an inactive trigger campaign and reports it done", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1692", "--yes"], {
      marketo: { campaigns: [{ id: 1692, name: "01 - Send Invite", type: "trigger", isActive: false }] },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(1692)?.isActive).toBe(true);
    expect(run.stdout).toMatch(/^done\s+1692 01 - Send Invite$/m);
    expect(run.stdout).toContain("1 done · 0 skipped · 0 failed");
  });
});
