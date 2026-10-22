import { describe, expect, it } from "vitest";
import { createInstancesRoot, VALID_ENV } from "./test-support/instances.ts";
import { runTestCli } from "./test-support/run-cli.ts";

const campaigns = [
  { id: 101, name: "Send Invite" },
  { id: 102, name: "Send Reminder" },
  { id: 103, name: "Send Follow Up" },
];

function withList(text: string) {
  return createInstancesRoot({ sec: { env: VALID_ENV, lists: { q4: text } } });
}

describe("campaign lists", () => {
  it("acts on every reference in a pasted column, one per line", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--list=q4", "--yes"], {
      instancesRoot: withList("101\n102\n103\n"),
      marketo: { campaigns },
    });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^done\s+101 Send Invite\ndone\s+102 Send Reminder\ndone\s+103 Send Follow Up$/m);
    expect(run.fake.campaign(102)?.isActive).toBe(true);
  });

  it("acts on every reference in a comma-separated row", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--list=q4", "--yes"], {
      instancesRoot: withList("101, 102 ,103"),
      marketo: { campaigns },
    });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^done\s+101 Send Invite\ndone\s+102 Send Reminder\ndone\s+103 Send Follow Up$/m);
  });

  it("keeps quoted cells whole, with commas, escaped quotes and CRLF line endings", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--list=q4", "--yes"], {
      instancesRoot: withList('"101"\r\n"Webinar, Q4.Send ""Invite""",102\r\n'),
      marketo: { campaigns },
    });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^done\s+101 Send Invite$/m);
    expect(run.stdout).toMatch(/^done\s+102 Send Reminder$/m);
    expect(run.stdout.match(/^failed\s.*$/gm)).toEqual([
      expect.stringMatching(/^failed\s+Webinar, Q4\.Send "Invite" \(/),
    ]);
  });

  it("ignores # comment lines, blank lines and blank cells", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--list=q4", "--yes"], {
      instancesRoot: withList("# Q4 webinars, invites first\n101,,\n\n   # 999, 998\n , 102\n"),
      marketo: { campaigns },
    });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^done\s+101 Send Invite\ndone\s+102 Send Reminder$/m);
    expect(run.stdout).not.toMatch(/^failed/m);
  });

  it("exits 2 without calling Marketo when the list file is missing, naming the lists that exist", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--list=q3", "--campaign=101"], {
      instancesRoot: withList("101"),
      marketo: { campaigns },
    });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain('List "q3" not found');
    expect(run.stderr).toContain("Available lists: q4");
    expect(run.fake.requests).toHaveLength(0);
  });

  it("exits 2 without calling Marketo when the list holds no references", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--list=q4"], {
      instancesRoot: withList("# nothing here yet\n,,\n"),
      marketo: { campaigns },
    });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("No campaign references given");
    expect(run.fake.requests).toHaveLength(0);
  });

  it("acts on the list's references and then the --campaign references", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=103", "--list=q4", "--yes"],
      { instancesRoot: withList("102\n101\n"), marketo: { campaigns } },
    );

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^done\s+102 Send Reminder\ndone\s+101 Send Invite\ndone\s+103 Send Follow Up$/m);
  });
});
