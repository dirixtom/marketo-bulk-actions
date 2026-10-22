import { parseArgs } from "node:util";
import { runCampaignAction } from "./campaign-runner.ts";
import { campaignActions } from "./commands.ts";
import { ConfigError } from "./errors.ts";
import { loadInstance } from "./instance.ts";
import { createMarketoClient, MarketoAuthError } from "./marketo-client.ts";

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

const FLAGS = {
  instance: { type: "string" },
  list: { type: "string" },
  campaign: { type: "string", multiple: true },
  workspace: { type: "string" },
  "dry-run": { type: "boolean" },
  yes: { type: "boolean" },
} as const;

/** The CLI entry: `argv` starts with the command name. Returns the exit code. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  let instanceName: string | undefined;
  try {
    const [commandName = "", ...rest] = argv;
    const action = campaignActions[commandName];
    if (!action) {
      throw new ConfigError(
        `Unknown command "${commandName}". Commands: ${Object.keys(campaignActions).join(", ")}`,
      );
    }
    const values = parseFlags(rest);
    if (!values.instance) throw new ConfigError("--instance is required, e.g. --instance=sec");
    if (values.list !== undefined) throw new ConfigError("--list is not yet supported, use --campaign");
    if (values.workspace !== undefined) throw new ConfigError("--workspace is not yet supported");
    const references = values.campaign ?? [];
    if (references.length === 0) {
      throw new ConfigError("No campaign references given. Pass --campaign=<id> (repeatable) or --list=<list>");
    }

    instanceName = values.instance;
    const instance = loadInstance(values.instance, deps.instancesRoot);
    const client = createMarketoClient(instance.credentials, { fetch: deps.fetch, sleep: deps.sleep });
    return await runCampaignAction(action, {
      instance,
      client,
      references,
      output: deps.output,
      confirm: deps.confirm,
      dryRun: values["dry-run"] ?? false,
      yes: values.yes ?? false,
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      deps.output.error(error.message);
      return 2;
    }
    if (error instanceof MarketoAuthError) {
      deps.output.error(
        `Marketo rejected the credentials for instance ${instanceName} (HTTP ${error.status}). ` +
          "Check MARKETO_CLIENT_ID and MARKETO_CLIENT_SECRET.",
      );
      return 2;
    }
    throw error;
  }
}

function parseFlags(args: string[]) {
  try {
    return parseArgs({ args, options: FLAGS, strict: true, allowPositionals: false }).values;
  } catch (error) {
    if (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS")) {
      throw new ConfigError(error.message);
    }
    throw error;
  }
}
