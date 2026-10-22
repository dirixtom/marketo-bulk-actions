import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_MUNCHKIN_ID } from "./fake-marketo.ts";

export interface InstanceFixture {
  /** Contents of `.env`; omitted means no file. */
  env?: string;
  /** Contents of `.env.local`; omitted means no file. */
  envLocal?: string;
  /** Contents of `config.json`; defaults to `{}`. `null` means no file. */
  config?: string | null;
  /** List files by name (without `.csv`). */
  lists?: Record<string, string>;
}

export const VALID_ENV = [
  `MARKETO_MUNCHKIN_ID=${FAKE_MUNCHKIN_ID}`,
  `MARKETO_CLIENT_ID=${FAKE_CLIENT_ID}`,
  `MARKETO_CLIENT_SECRET=${FAKE_CLIENT_SECRET}`,
].join("\n");

/** Creates a temporary instances root holding the given instance folders. */
export function createInstancesRoot(instances: Record<string, InstanceFixture> = { sec: { env: VALID_ENV } }): string {
  const root = mkdtempSync(join(tmpdir(), "marketo-instances-"));
  for (const [name, fixture] of Object.entries(instances)) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    if (fixture.env !== undefined) writeFileSync(join(dir, ".env"), fixture.env);
    if (fixture.envLocal !== undefined) writeFileSync(join(dir, ".env.local"), fixture.envLocal);
    const config = fixture.config === undefined ? "{}" : fixture.config;
    if (config !== null) writeFileSync(join(dir, "config.json"), config);
    if (fixture.lists) {
      mkdirSync(join(dir, "lists"), { recursive: true });
      for (const [list, text] of Object.entries(fixture.lists)) {
        writeFileSync(join(dir, "lists", `${list}.csv`), text);
      }
    }
  }
  return root;
}
