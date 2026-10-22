import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Outcome = "done" | "skipped" | "failed";

export interface RunRecordCampaign {
  reference: string;
  id: number | null;
  name: string | null;
  outcome: Outcome;
  /** Present only when the outcome is `failed`. */
  reason?: string;
}

export interface RunRecord {
  command: string;
  instance: string;
  workspace: string | null;
  startedAt: string;
  finishedAt: string;
  campaigns: RunRecordCampaign[];
}

/**
 * Writes the record to `<instanceFolder>/runs/<startedAt>-<command>.json`.
 * Colons become dashes so the file name is valid on every file system.
 * Returns the path written.
 */
export function writeRunRecord(instanceFolder: string, record: RunRecord): string {
  const dir = join(instanceFolder, "runs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.startedAt}-${record.command}.json`.replaceAll(":", "-"));
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}
