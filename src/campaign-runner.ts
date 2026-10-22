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
  /** `--workspace` as given, a workspace name or ID that narrows name references. */
  workspace?: string;
}

interface CampaignResult {
  reference: string;
  id?: number;
  name?: string;
  outcome?: Outcome;
  reason?: string;
  /** The earlier result for the same campaign. The campaign is acted on and printed once, under that result. */
  sameAs?: CampaignResult;
}

/** A result whose reference resolved to a campaign ID. */
type ResolvedResult = CampaignResult & { id: number };
/** A result once planning or acting has given it an outcome. */
type SettledResult = CampaignResult & { outcome: Outcome };

const isPending = (result: CampaignResult): result is ResolvedResult =>
  result.id !== undefined && result.outcome === undefined;
const isSettled = (result: CampaignResult): result is SettledResult => result.outcome !== undefined;

/** The resolve, plan, confirm, act, report flow for one campaign action. */
export async function runCampaignAction(action: CampaignAction, options: RunOptions): Promise<number> {
  const { client, references, output } = options;
  const startedAt = options.now();
  const resolutions = await resolveReferences(references, client, options.workspace);
  const firstById = new Map<number, CampaignResult>();
  const allResults: CampaignResult[] = resolutions.map((resolution) => {
    if (!("id" in resolution)) return { reference: resolution.reference, outcome: "failed", reason: resolution.error };
    const result: CampaignResult = { reference: resolution.reference, id: resolution.id };
    const first = firstById.get(resolution.id);
    if (first) result.sameAs = first;
    else firstById.set(resolution.id, result);
    return result;
  });
  const results = allResults.filter((result) => result.sameAs === undefined);

  await settleAll(results.filter(isPending).map((result) => plan(action, client, result)));
  const toChange = results.filter(isPending);
  const exitCode = () => (results.some((r) => r.outcome === "failed") ? 1 : 0);

  printPlan(action, results, output);

  if (toChange.length === 0) {
    output.log(`Nothing to ${action.verb}.`);
    output.log("");
    report(results.filter(isSettled), output);
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

  let runEndingError: MarketoQuotaError | MarketoAuthError | undefined;
  await settleAll(
    toChange.map(async (result) => {
      try {
        await action.act(client, result.id);
        result.outcome = "done";
      } catch (error) {
        const reason = RUN_ENDING_REASONS.find(([type]) => error instanceof type)?.[1];
        if (reason === undefined) return fail(result, describeError(error));
        runEndingError ??= error as MarketoQuotaError | MarketoAuthError;
        fail(result, reason);
      }
    }),
  );
  // A later reference to the same campaign takes over the first one's name, outcome and reason.
  for (const result of allResults) {
    if (!result.sameAs) continue;
    const { name, outcome, reason } = result.sameAs;
    Object.assign(result, { name, outcome, reason });
  }

  output.log("");
  report(results.filter(isSettled), output);
  writeRunRecord(options.instance.folder, {
    command: action.command,
    instance: options.instance.name,
    workspace: options.workspace ?? null,
    startedAt: startedAt.toISOString(),
    finishedAt: options.now().toISOString(),
    campaigns: allResults.filter(isSettled).map((result) => ({
      reference: result.reference,
      id: result.id ?? null,
      name: result.name ?? null,
      outcome: result.outcome,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    })),
  });
  // Reported and recorded first, so the operator sees what changed before the run ends.
  if (runEndingError) throw runEndingError;
  return exitCode();
}

/** Errors that end the run, with the reason given to each campaign they stopped while acting. */
const RUN_ENDING_REASONS = [
  [MarketoQuotaError, "daily API quota reached"],
  [MarketoAuthError, "Marketo rejected the credentials"],
] as const;

/**
 * Waits for every task, then rethrows the first error that must end the run. The Marketo
 * client caps how many calls run at once, so the tasks can all start together.
 */
async function settleAll(tasks: Promise<void>[]): Promise<void> {
  const rejected = (await Promise.allSettled(tasks)).find((s) => s.status === "rejected");
  if (rejected) throw rejected.reason;
}

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
async function plan(action: CampaignAction, client: MarketoClient, result: ResolvedResult): Promise<void> {
  let campaign;
  try {
    campaign = await client.getSmartCampaign(result.id);
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

/** Describes an error that fails one campaign. Errors that must end the run are rethrown. */
function describeError(error: unknown): string {
  if (error instanceof MarketoAuthError || error instanceof MarketoQuotaError) throw error;
  if (error instanceof MarketoApiError) return `Marketo error ${error.code}: ${error.marketoMessage}`;
  return error instanceof Error ? error.message : String(error);
}

function label(result: CampaignResult): string {
  if (result.name !== undefined) return `${result.id} ${result.name}`;
  return result.id !== undefined ? String(result.id) : result.reference;
}

function describe(result: CampaignResult): string {
  return `${label(result)}${result.reason ? ` (${result.reason})` : ""}`;
}

function report(results: SettledResult[], output: Output): void {
  const counts = { done: 0, skipped: 0, failed: 0 };
  for (const result of results) {
    counts[result.outcome] += 1;
    output.log(`${result.outcome.padEnd(8)} ${describe(result)}`);
  }
  output.log(`${counts.done} done · ${counts.skipped} skipped · ${counts.failed} failed`);
}
