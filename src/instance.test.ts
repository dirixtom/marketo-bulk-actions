import { describe, expect, it } from "vitest";
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_MUNCHKIN_ID } from "./test-support/fake-marketo.ts";
import { createInstancesRoot, VALID_ENV } from "./test-support/instances.ts";
import { runTestCli } from "./test-support/run-cli.ts";

const campaigns = [{ id: 1, name: "One" }];
const activate = (instance: string) => ["campaigns:activate", `--instance=${instance}`, "--campaign=1", "--yes"];

describe("loading an instance", () => {
  it("lists the available instances when the folder does not exist", async () => {
    const instancesRoot = createInstancesRoot({ sec: { env: VALID_ENV }, acme: { env: VALID_ENV } });

    const run = await runTestCli(activate("sce"), { instancesRoot, marketo: { campaigns } });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain('Instance "sce" not found');
    expect(run.stderr).toContain("Available instances: acme, sec");
    expect(run.fake.requests).toHaveLength(0);
  });

  it.each([
    ["MARKETO_MUNCHKIN_ID", `MARKETO_CLIENT_ID=${FAKE_CLIENT_ID}\nMARKETO_CLIENT_SECRET=${FAKE_CLIENT_SECRET}`],
    ["MARKETO_CLIENT_ID", `MARKETO_MUNCHKIN_ID=${FAKE_MUNCHKIN_ID}\nMARKETO_CLIENT_SECRET=${FAKE_CLIENT_SECRET}`],
    ["MARKETO_CLIENT_SECRET", `MARKETO_MUNCHKIN_ID=${FAKE_MUNCHKIN_ID}\nMARKETO_CLIENT_ID=${FAKE_CLIENT_ID}`],
  ])("names %s when it is missing", async (variable, env) => {
    const instancesRoot = createInstancesRoot({ sec: { env } });

    const run = await runTestCli(activate("sec"), { instancesRoot, marketo: { campaigns } });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(`${variable} is missing`);
    expect(run.fake.requests).toHaveLength(0);
  });

  it("names a malformed munchkin ID without printing secrets", async () => {
    const instancesRoot = createInstancesRoot({
      sec: { env: VALID_ENV.replace(FAKE_MUNCHKIN_ID, "123-abc-45") },
    });

    const run = await runTestCli(activate("sec"), { instancesRoot, marketo: { campaigns } });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("MARKETO_MUNCHKIN_ID is malformed");
    expect(run.output).not.toContain(FAKE_CLIENT_SECRET);
    expect(run.fake.requests).toHaveLength(0);
  });

  it("lets .env.local override .env", async () => {
    const instancesRoot = createInstancesRoot({
      sec: {
        env: VALID_ENV.replace(FAKE_CLIENT_SECRET, "stale-secret"),
        envLocal: `MARKETO_CLIENT_SECRET=${FAKE_CLIENT_SECRET}`,
      },
    });

    const run = await runTestCli(activate("sec"), { instancesRoot, marketo: { campaigns } });

    expect(run.exitCode).toBe(0);
    expect(run.fake.campaign(1)?.isActive).toBe(true);
  });

  it("works with credentials only in .env.local", async () => {
    const instancesRoot = createInstancesRoot({ sec: { envLocal: VALID_ENV } });

    const run = await runTestCli(activate("sec"), { instancesRoot, marketo: { campaigns } });

    expect(run.exitCode).toBe(0);
  });

  it.each([
    ["has unknown keys", '{"restBaseUrl":"https://example.com"}'],
    ["is not JSON", "{"],
  ])("rejects a config.json that %s", async (_, config) => {
    const instancesRoot = createInstancesRoot({ sec: { env: VALID_ENV, config } });

    const run = await runTestCli(activate("sec"), { instancesRoot, marketo: { campaigns } });

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("config.json");
    expect(run.fake.requests).toHaveLength(0);
  });
});
