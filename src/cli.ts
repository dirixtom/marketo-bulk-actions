import { parseArgs } from "node:util";
import { runCampaignAction } from "./campaign-runner.ts";
import { campaignActions } from "./commands.ts";
import { loadInstance } from "./instance.ts";
import { createMarketoClient } from "./marketo-client.ts";

export interface Output {
  log: (line: string) => void;
  error: (line: string) => void;
}

export interface CliDeps {
  instancesRoot: string;
  fetch: typeof fetch;
  confirm: (question: string) => Promise<boolean>;
  output: Output;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

/** The CLI entry: `argv` starts with the command name. Returns the exit code. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const [commandName, ...rest] = argv;
  const action = campaignActions[commandName ?? ""]!;
  const { values } = parseArgs({
    args: rest,
    options: {
      instance: { type: "string" },
      campaign: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean" },
    },
  });
  const instance = loadInstance(values.instance!, deps.instancesRoot);
  const client = createMarketoClient(instance.credentials, { fetch: deps.fetch, sleep: deps.sleep });
  return runCampaignAction(action, {
    instance,
    client,
    references: values.campaign ?? [],
    output: deps.output,
    confirm: deps.confirm,
    dryRun: values["dry-run"] ?? false,
    yes: values.yes ?? false,
  });
}
