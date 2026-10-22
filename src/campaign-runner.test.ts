import { describe, expect, it } from "vitest";
import { createFakeMarketo } from "./test-support/fake-marketo.ts";
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

describe("planning which campaigns change", () => {
  it("skips campaigns already in the target state and changes the rest", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=1", "--campaign=2", "--yes"],
      {
        marketo: {
          campaigns: [
            { id: 1, name: "Already on", isActive: true },
            { id: 2, name: "Off", isActive: false },
          ],
        },
      },
    );

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^skipped\s+1 Already on \(already active\)$/m);
    expect(run.stdout).toMatch(/^done\s+2 Off$/m);
    expect(run.stdout).toContain("1 done · 1 skipped · 0 failed");
    expect(run.fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("fails batch campaigns with a clear reason and exits 1", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=5", "--campaign=6", "--yes"],
      {
        marketo: {
          campaigns: [
            { id: 5, name: "Monthly newsletter", type: "batch" },
            { id: 6, name: "Trigger", type: "trigger" },
          ],
        },
      },
    );

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(
      /^failed\s+5 Monthly newsletter \(batch campaigns are scheduled, not activated\)$/m,
    );
    expect(run.fake.campaign(5)?.isActive).toBe(false);
    expect(run.fake.campaign(6)?.isActive).toBe(true);
    expect(run.stdout).toContain("1 done · 0 skipped · 1 failed");
  });

  it("fails an unknown ID without blocking the others", async () => {
    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=404", "--campaign=7", "--yes"],
      { marketo: { campaigns: [{ id: 7, name: "Known" }] } },
    );

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^failed\s+404 \(not found\)$/m);
    expect(run.stdout).toMatch(/^done\s+7 Known$/m);
    expect(run.stdout).toContain("1 done · 0 skipped · 1 failed");
  });
});

describe("acting on campaigns", () => {
  it("fails a campaign Marketo rejects with its code and message and carries on", async () => {
    const fake = createFakeMarketo({
      campaigns: [
        { id: 1, name: "Broken flow" },
        { id: 2, name: "Fine" },
      ],
    });
    fake.failWith({
      method: "POST",
      path: "/rest/asset/v1/smartCampaign/1/activate.json",
      code: "709",
      message: "Campaign has no flow steps",
    });

    const run = await runTestCli(
      ["campaigns:activate", "--instance=sec", "--campaign=1", "--campaign=2", "--yes"],
      { fake },
    );

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^failed\s+1 Broken flow \(Marketo error 709: Campaign has no flow steps\)$/m);
    expect(run.stdout).toMatch(/^done\s+2 Fine$/m);
    expect(run.fake.campaign(2)?.isActive).toBe(true);
    expect(run.stdout).toContain("1 done · 0 skipped · 1 failed");
  });
});

describe("confirming the plan", () => {
  const campaigns = [
    { id: 1, name: "To change" },
    { id: 2, name: "Already on", isActive: true },
    { id: 3, name: "Newsletter", type: "batch" as const },
  ];
  const argv = ["campaigns:activate", "--instance=sec", "--campaign=1", "--campaign=2", "--campaign=3", "--campaign=99"];

  it("prints the plan and asks before changing anything", async () => {
    const run = await runTestCli(argv, { marketo: { campaigns }, confirm: true });

    expect(run.prompts).toEqual(["Activate 1 campaign on instance sec?"]);
    const planEnd = run.stdout.indexOf("Activate 1 campaign on instance sec?");
    const plan = run.stdout.slice(0, planEnd === -1 ? undefined : planEnd);
    expect(plan).toMatch(/Will activate \(1\):\n\s+1 To change\n/);
    expect(plan).toMatch(/Skipped \(1\):\n\s+2 Already on \(already active\)\n/);
    expect(plan).toMatch(
      /Failed \(2\):\n\s+3 Newsletter \(batch campaigns are scheduled, not activated\)\n\s+99 \(not found\)\n/,
    );
    expect(run.fake.campaign(1)?.isActive).toBe(true);
    expect(run.stdout).toContain("1 done · 1 skipped · 2 failed");
  });

  it("changes nothing and exits 0 when the operator declines", async () => {
    const run = await runTestCli(argv, { marketo: { campaigns }, confirm: false });

    expect(run.prompts).toHaveLength(1);
    expect(run.exitCode).toBe(0);
    expect(run.fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(0);
    expect(run.fake.campaign(1)?.isActive).toBe(false);
    expect(run.stdout).toContain("Nothing changed.");
  });

  it("stops after the plan on --dry-run without asking", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=1", "--dry-run"], {
      marketo: { campaigns },
    });

    expect(run.prompts).toHaveLength(0);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/Will activate \(1\):\n\s+1 To change\n/);
    expect(run.stdout).toContain("Dry run: nothing changed.");
    expect(run.fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(0);
  });

  it("does not ask when nothing will change", async () => {
    const run = await runTestCli(["campaigns:activate", "--instance=sec", "--campaign=2"], {
      marketo: { campaigns },
    });

    expect(run.prompts).toHaveLength(0);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Nothing to activate.");
    expect(run.stdout).toMatch(/^skipped\s+2 Already on \(already active\)$/m);
    expect(run.stdout).toContain("0 done · 1 skipped · 0 failed");
    expect(run.fake.restRequests().filter((r) => r.method === "POST")).toHaveLength(0);
  });
});

describe("deactivating smart campaigns by ID", () => {
  it("deactivates active trigger campaigns", async () => {
    const run = await runTestCli(
      ["campaigns:deactivate", "--instance=sec", "--campaign=10", "--campaign=11", "--yes"],
      {
        marketo: {
          campaigns: [
            { id: 10, name: "Alpha", isActive: true },
            { id: 11, name: "Beta", isActive: true },
          ],
        },
      },
    );

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(10)?.isActive).toBe(false);
    expect(run.fake.campaign(11)?.isActive).toBe(false);
    expect(run.stdout).toMatch(/^done\s+10 Alpha$/m);
    expect(run.stdout).toMatch(/^done\s+11 Beta$/m);
    expect(run.stdout).toContain("2 done · 0 skipped · 0 failed");
  });
});
