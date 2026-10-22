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

describe("fetching the campaign catalog", () => {
  const catalogRequests = (run: Awaited<ReturnType<typeof runTestCli>>) =>
    run.fake.restRequests().filter((r) => r.url.pathname === "/rest/v1/campaigns.json");

  it("does not fetch the catalog when every reference is an ID", async () => {
    const run = await runTestCli(activate("1", "2"), {
      marketo: {
        campaigns: [
          { id: 1, name: "One" },
          { id: 2, name: "Two" },
        ],
      },
    });

    expect(run.exitCode).toBe(0);
    expect(catalogRequests(run)).toHaveLength(0);
  });

  it("fetches every page once for all name references", async () => {
    const campaigns = Array.from({ length: 650 }, (_, i) => ({
      id: i + 1,
      name: `Campaign ${i + 1}`,
      programName: "Program",
    }));

    const run = await runTestCli(activate("Campaign 2", "Program.Campaign 640"), { marketo: { campaigns } });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(2)?.isActive).toBe(true);
    expect(run.fake.campaign(640)?.isActive).toBe(true);
    const pages = catalogRequests(run);
    expect(pages.map((r) => r.url.searchParams.get("nextPageToken"))).toEqual([null, "300", "600"]);
  });
});

describe("looking up folder names", () => {
  it("looks up the folders of campaigns outside programs concurrently", async () => {
    const ids = [1, 2, 3, 4, 5];
    const run = await runTestCli(activate("Folder 3.Score leads"), {
      marketo: {
        campaigns: ids.map((id) => ({ id, name: "Score leads", folder: { id: id * 10, type: "Folder" as const } })),
        folders: ids.map((id) => ({ id: id * 10, name: `Folder ${id}` })),
      },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(3)?.isActive).toBe(true);
    expect(run.fake.maxConcurrentRequests()).toBe(5);
  });
});

describe("narrowing names to one workspace", () => {
  const campaigns = [
    { id: 1, name: "Send Invite", programName: "EMEA Webinar", workspace: "EMEA" },
    { id: 2, name: "Send Invite", programName: "US Webinar", workspace: "US" },
  ];

  it("passes --workspace by name as workspaceName", async () => {
    const run = await runTestCli([...activate("Send Invite"), "--workspace=EMEA"], { marketo: { campaigns } });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(1)?.isActive).toBe(true);
    expect(run.fake.campaign(2)?.isActive).toBe(false);
    const catalog = run.fake.restRequests().filter((r) => r.url.pathname === "/rest/v1/campaigns.json");
    expect(catalog.map((r) => r.url.searchParams.get("workspaceName"))).toEqual(["EMEA"]);
  });

  const folders = [
    { id: 15, name: "EMEA", folderType: "Zone" },
    { id: 16, name: "US", folderType: "Zone" },
    { id: 17, name: "Webinars", folderType: "Folder" },
  ];

  it("resolves a numeric --workspace to its name first", async () => {
    const run = await runTestCli([...activate("Send Invite"), "--workspace=16"], {
      marketo: { campaigns, folders },
    });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(2)?.isActive).toBe(true);
    expect(run.fake.campaign(1)?.isActive).toBe(false);
    const catalog = run.fake.restRequests().filter((r) => r.url.pathname === "/rest/v1/campaigns.json");
    expect(catalog.map((r) => r.url.searchParams.get("workspaceName"))).toEqual(["US"]);
  });

  it("exits 2 naming the known workspaces when a numeric --workspace matches none", async () => {
    const run = await runTestCli([...activate("Send Invite"), "--workspace=17"], {
      marketo: { campaigns, folders },
    });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("Workspace 17 not found. Workspaces: 15 EMEA, 16 US");
    expect(run.fake.restRequests().filter((r) => r.url.pathname === "/rest/v1/campaigns.json")).toHaveLength(0);
  });
});
