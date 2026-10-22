import { describe, expect, it } from "vitest";
import { runTestCli } from "./test-support/run-cli.ts";

const activate = (...references: string[]) => [
  "campaigns:activate",
  "--instance=sec",
  ...references.map((reference) => `--campaign=${reference}`),
  "--yes",
];

describe("resolving campaign references by name", () => {
  it("resolves a bare name with one match", async () => {
    const run = await runTestCli(activate("Send Invite"), {
      marketo: { campaigns: [{ id: 1692, name: "Send Invite", programName: "Webinar Q4" }] },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(1692)?.isActive).toBe(true);
    expect(run.stdout).toMatch(/^done\s+1692 Send Invite$/m);
  });

  it("resolves Program.Campaign when the program name contains dots", async () => {
    const run = await runTestCli(activate("Webinar 2026.10 Q4.01 - Send Invite"), {
      marketo: {
        campaigns: [
          { id: 1, name: "01 - Send Invite", programName: "Webinar 2026.10 Q4" },
          { id: 2, name: "01 - Send Invite", programName: "Webinar 2026.11 Q4" },
        ],
      },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(1)?.isActive).toBe(true);
    expect(run.fake.campaign(2)?.isActive).toBe(false);
    expect(run.stdout).toMatch(/^done\s+1 01 - Send Invite$/m);
  });

  it("matches campaigns outside a program as Folder.Campaign", async () => {
    const run = await runTestCli(activate("Operational.Score leads"), {
      marketo: {
        campaigns: [
          { id: 7, name: "Score leads", folder: { id: 70, type: "Folder" } },
          { id: 8, name: "Score leads", folder: { id: 80, type: "Folder" } },
        ],
        folders: [
          { id: 70, name: "Operational" },
          { id: 80, name: "Archive" },
        ],
      },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(7)?.isActive).toBe(true);
    expect(run.fake.campaign(8)?.isActive).toBe(false);
  });
});
