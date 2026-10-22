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
        { reference: "2", id: 2, name: "Already on", outcome: "skipped" },
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
});
