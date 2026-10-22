import type { CampaignAction } from "./commands.ts";
import type { Instance } from "./instance.ts";
import { MarketoApiError, MarketoAuthError, type MarketoClient, MarketoQuotaError } from "./marketo-client.ts";
import { resolveReferences } from "./resolve-references.ts";
import { type Outcome, writeRunRecord } from "./run-record.ts";
import type { Output } from "./cli.ts";

export interface RunOptions {
  instance: Instance;
  client: MarketoClient;
  references: string[];
  output: Output;
  confirm: (question: string) => Promise<boolean>;
  dryRun: boolean;
  yes: boolean;
  now: () => Date;
  /** `--workspace` as given: a workspace name or ID that narrows name references. */
  workspace?: string;
}

interface CampaignResult {
  reference: string;
  id?: number;
  name?: string;
  outcome?: Outcome;
  reason?: string;
}

/** The resolve, plan, confirm, act, report flow for one campaign action. */
export async function runCampaignAction(action: CampaignAction, options: RunOptions): Promise<number> {
  const { client, references, output } = options;
  const startedAt = options.now();
  const resolutions = await resolveReferences(references, client, options.workspace);
  const results: CampaignResult[] = resolutions.map((resolution) =>
    "id" in resolution
      ? { reference: resolution.reference, id: resolution.id }
      : { reference: resolution.reference, outcome: "failed", reason: resolution.error },
  );

  for (const result of results) {
    if (result.outcome === undefined) await plan(action, client, result);
  }
  const toChange = results.filter((r) => r.outcome === undefined);
  const exitCode = () => (results.some((r) => r.outcome === "failed") ? 1 : 0);

  printPlan(action, results, output);

  if (toChange.length === 0) {
    output.log(`Nothing to ${action.verb}.`);
    output.log("");
    report(results, output);
    return exitCode();
  }
  if (options.dryRun) {
    output.log("Dry run: nothing changed.");
    return exitCode();
  }
  if (!options.yes) {
    const count = `${toChange.length} campaign${toChange.length === 1 ? "" : "s"}`;
    const confirmed = await options.confirm(`${capitalize(action.verb)} ${count} on instance ${options.instance.name}?`);
    if (!confirmed) {
      output.log("Nothing changed.");
      return 0;
    }
  }

  let quotaError: MarketoQuotaError | undefined;
  for (const result of toChange) {
    if (quotaError) {
      fail(result, QUOTA_REASON);
      continue;
    }
    try {
      await action.act(client, result.id!);
      result.outcome = "done";
    } catch (error) {
      if (error instanceof MarketoQuotaError) {
        quotaError = error;
        fail(result, QUOTA_REASON);
      } else {
        fail(result, describeError(error));
      }
    }
  }

  output.log("");
  report(results, output);
  writeRunRecord(options.instance.folder, {
    command: action.command,
    instance: options.instance.name,
    workspace: options.workspace ?? null,
    startedAt: startedAt.toISOString(),
    finishedAt: options.now().toISOString(),
    campaigns: results.map((result) => {
      const outcome = result.outcome ?? "failed";
      return {
        reference: result.reference,
        id: result.id !== undefined && !Number.isNaN(result.id) ? result.id : null,
        name: result.name ?? null,
        outcome,
        ...(outcome === "failed" ? { reason: result.reason ?? "unknown error" } : {}),
      };
    }),
  });
  // Reported and recorded first, so the operator sees what changed before the run ends.
  if (quotaError) throw quotaError;
  return exitCode();
}

const QUOTA_REASON = "daily API quota reached";

function printPlan(action: CampaignAction, results: CampaignResult[], output: Output): void {
  const sections: [string, CampaignResult[]][] = [
    [`Will ${action.verb}`, results.filter((r) => r.outcome === undefined)],
    ["Skipped", results.filter((r) => r.outcome === "skipped")],
    ["Failed", results.filter((r) => r.outcome === "failed")],
  ];
  for (const [title, members] of sections) {
    if (members.length === 0) continue;
    output.log(`${title} (${members.length}):`);
    for (const result of members) output.log(`  ${describe(result)}`);
  }
  output.log("");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Reads the campaign and marks it skipped or failed when it must not change. */
async function plan(action: CampaignAction, client: MarketoClient, result: CampaignResult): Promise<void> {
  let campaign;
  try {
    campaign = await client.getSmartCampaign(result.id!);
  } catch (error) {
    return fail(result, describeError(error));
  }
  if (!campaign) return fail(result, "not found");
  result.name = campaign.name;
  if (campaign.type === "batch") return fail(result, `batch campaigns are scheduled, not ${action.verb}d`);
  if (campaign.type !== "trigger") {
    return fail(result, `${campaign.type} campaigns cannot be ${action.verb}d, only trigger campaigns`);
  }
  if (campaign.isActive === action.targetActive) {
    result.outcome = "skipped";
    result.reason = `already ${action.targetActive ? "active" : "inactive"}`;
  }
}

function fail(result: CampaignResult, reason: string): void {
  result.outcome = "failed";
  result.reason = reason;
}

/** Describes an error that fails one campaign; errors that must end the run are rethrown. */
function describeError(error: unknown): string {
  if (error instanceof MarketoAuthError || error instanceof MarketoQuotaError) throw error;
  if (error instanceof MarketoApiError) return `Marketo error ${error.code}: ${error.marketoMessage}`;
  return error instanceof Error ? error.message : String(error);
}

function label(result: CampaignResult): string {
  if (result.name !== undefined) return `${result.id} ${result.name}`;
  return result.id !== undefined && !Number.isNaN(result.id) ? String(result.id) : result.reference;
}

function describe(result: CampaignResult): string {
  return `${label(result)}${result.reason ? ` (${result.reason})` : ""}`;
}

function report(results: CampaignResult[], output: Output): void {
  const counts = { done: 0, skipped: 0, failed: 0 };
  for (const result of results) {
    const outcome = result.outcome ?? "failed";
    counts[outcome] += 1;
    output.log(`${outcome.padEnd(8)} ${describe(result)}`);
  }
  output.log(`${counts.done} done · ${counts.skipped} skipped · ${counts.failed} failed`);
}
