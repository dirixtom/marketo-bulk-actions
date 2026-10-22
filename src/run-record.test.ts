import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTestCli } from "./test-support/run-cli.ts";

function runRecords(instancesRoot: string, instance = "sec"): { file: string; record: unknown }[] {
  const dir = join(instancesRoot, instance, "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((file) => ({
    file,
    record: JSON.parse(readFileSync(join(dir, file), "utf8")),
  }));
}

describe("saving a run record", () => {
  it("writes one record with every reference's outcome after a confirmed run", async () => {
    const run = await runTestCli(
      [
        "campaigns:activate",
        "--instance=sec",
        "--campaign=1",
        "--campaign=2",
        "--campaign=3",
        "--campaign=404",
        "--yes",
      ],
      {
        marketo: {
          campaigns: [
            { id: 1, name: "Off", isActive: false },
            { id: 2, name: "Already on", isActive: true },
            { id: 3, name: "Newsletter", type: "batch" },
          ],
        },
      },
    );

    const records = runRecords(run.instancesRoot);
    expect(records).toHaveLength(1);
    expect(records[0]!.file).toBe("2026-10-22T09-30-00.000Z-campaigns-activate.json");
    expect(records[0]!.record).toEqual({
      command: "campaigns:activate",
      instance: "sec",
      workspace: null,
      startedAt: "2026-10-22T09:30:00.000Z",
      finishedAt: "2026-10-22T09:30:00.000Z",
      campaigns: [
        { reference: "1", id: 1, name: "Off", outcome: "done" },
        { reference: "2", id: 2, name: "Already on", outcome: "skipped", reason: "already active" },
        {
          reference: "3",
          id: 3,
          name: "Newsletter",
          outcome: "failed",
          reason: "batch campaigns are scheduled, not activated",
        },
        { reference: "404", id: 404, name: null, outcome: "failed", reason: "not found" },
      ],
    });
  });

  it("lists every reference to the same campaign, each with the first one's outcome", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=Send Invite", "--campaign=1692", "--campaign=1692", "--yes"],
      { marketo: { campaigns: [{ id: 1692, name: "Send Invite", programName: "Webinar" }] } },
    );

    expect(run.stdout.match(/^done\s+1692 Send Invite$/gm)).toHaveLength(1);
    const [only] = runRecords(run.instancesRoot);
    expect((only!.record as { campaigns: unknown }).campaigns).toEqual([
      { reference: "Send Invite", id: 1692, name: "Send Invite", outcome: "done" },
      { reference: "1692", id: 1692, name: "Send Invite", outcome: "done" },
      { reference: "1692", id: 1692, name: "Send Invite", outcome: "done" },
    ]);
  });

  it("takes the start and finish timestamps from the injected clock", async () => {
    const ticks = [new Date("2026-10-22T09:30:00.000Z"), new Date("2026-10-22T09:31:15.250Z")];
    const run = await runTestCli(["campaigns:deactivate", "--instance=sec", "--campaign=1", "--yes"], {
      marketo: { campaigns: [{ id: 1, name: "On", isActive: true }] },
      now: () => ticks.shift() ?? new Date("2099-01-01T00:00:00.000Z"),
    });

    const [only] = runRecords(run.instancesRoot);
    expect(only!.file).toBe("2026-10-22T09-30-00.000Z-campaigns-deactivate.json");
    expect(only!.record).toMatchObject({
      command: "campaigns:deactivate",
      startedAt: "2026-10-22T09:30:00.000Z",
      finishedAt: "2026-10-22T09:31:15.250Z",
    });
  });

  it("writes no record on a dry run", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1", "--dry-run"], {
      marketo: { campaigns: [{ id: 1, name: "Off" }] },
    });

    expect(run.exitCode).toBe(0);
    expect(runRecords(run.instancesRoot)).toEqual([]);
  });

  it("writes no record when the operator declines the prompt", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1"], {
      marketo: { campaigns: [{ id: 1, name: "Off" }] },
      confirm: false,
    });

    expect(run.prompts).toHaveLength(1);
    expect(runRecords(run.instancesRoot)).toEqual([]);
  });

  it("writes no record when there is nothing to change", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=1", "--campaign=404", "--yes"],
      { marketo: { campaigns: [{ id: 1, name: "On", isActive: true }] } },
    );

    expect(run.stdout).toContain("Nothing to activate.");
    expect(runRecords(run.instancesRoot)).toEqual([]);
  });
});
