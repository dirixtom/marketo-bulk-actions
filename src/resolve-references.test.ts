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

  it("fails a name that matches nothing without blocking the others", async () => {
    const run = await runTestCli(activate("Send Invtie", "Send Invite"), {
      marketo: { campaigns: [{ id: 1, name: "Send Invite", programName: "Webinar" }] },
    });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^failed\s+Send Invtie \(not found\)$/m);
    expect(run.stdout).toMatch(/^done\s+1 Send Invite$/m);
    expect(run.stdout).toContain("1 done · 0 skipped · 1 failed");
  });

  it("fails an ambiguous name, listing the Parent.Campaign candidates", async () => {
    const run = await runTestCli(activate("01 - Send Invite"), {
      marketo: {
        campaigns: [
          { id: 1, name: "01 - Send Invite", programName: "Webinar 2026.10 Q4" },
          { id: 2, name: "01 - Send Invite", programName: "Webinar 2026.11 Q4" },
          { id: 3, name: "01 - Send Invite", folder: { id: 70, type: "Folder" } },
        ],
        folders: [{ id: 70, name: "Operational" }],
      },
    });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(
      /^failed\s+01 - Send Invite \(ambiguous, matches: Webinar 2026\.10 Q4\.01 - Send Invite; Webinar 2026\.11 Q4\.01 - Send Invite; Operational\.01 - Send Invite\)$/m,
    );
    expect(run.fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(0);
  });

  it("acts once on references that resolve to the same campaign", async () => {
    const run = await runTestCli(activate("Send Invite", "1692", "Webinar.Send Invite", "1692"), {
      marketo: { campaigns: [{ id: 1692, name: "Send Invite", programName: "Webinar" }] },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(1);
    expect(run.stdout.match(/^done\s+1692 Send Invite$/gm)).toHaveLength(1);
    expect(run.stdout).toContain("1 done · 0 skipped · 0 failed");
  });
});
