import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { ConfigError } from "./errors.ts";

export interface Credentials {
  munchkinId: string;
  clientId: string;
  clientSecret: string;
}

export interface Instance {
  name: string;
  folder: string;
  credentials: Credentials;
  config: InstanceConfig;
}

const MUNCHKIN_ID_PATTERN = /^\d{3}-[A-Z]{3}-\d{3}$/;

const credentialsSchema = z.object({
  MARKETO_MUNCHKIN_ID: z
    .string({ error: "MARKETO_MUNCHKIN_ID is missing" })
    .regex(MUNCHKIN_ID_PATTERN, "MARKETO_MUNCHKIN_ID is malformed, expected a value like 123-ABC-456"),
  MARKETO_CLIENT_ID: z.string({ error: "MARKETO_CLIENT_ID is missing" }).min(1, "MARKETO_CLIENT_ID is missing"),
  MARKETO_CLIENT_SECRET: z
    .string({ error: "MARKETO_CLIENT_SECRET is missing" })
    .min(1, "MARKETO_CLIENT_SECRET is missing"),
});

const configSchema = z.strictObject({});
export type InstanceConfig = z.infer<typeof configSchema>;

/** Loads `<instancesRoot>/<name>`: credentials from `.env` then `.env.local`, and `config.json`. */
export function loadInstance(name: string, instancesRoot: string): Instance {
  const folder = join(instancesRoot, name);
  if (!isInstanceName(name) || !isDirectory(folder)) {
    const available = listInstances(instancesRoot);
    throw new ConfigError(
      `Instance "${name}" not found in ${instancesRoot}. ` +
        (available.length > 0 ? `Available instances: ${available.join(", ")}` : "No instances exist yet."),
    );
  }

  const env = { ...readEnvFile(join(folder, ".env")), ...readEnvFile(join(folder, ".env.local")) };
  const parsed = credentialsSchema.safeParse(env);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message);
    throw new ConfigError(`Instance "${name}": ${messages.join("; ")} (in .env or .env.local)`);
  }

  return {
    name,
    folder,
    credentials: {
      munchkinId: parsed.data.MARKETO_MUNCHKIN_ID,
      clientId: parsed.data.MARKETO_CLIENT_ID,
      clientSecret: parsed.data.MARKETO_CLIENT_SECRET,
    },
    config: readConfig(name, join(folder, "config.json")),
  };
}

function isInstanceName(name: string): boolean {
  return /^[\w-][\w.-]*$/.test(name);
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function listInstances(instancesRoot: string): string[] {
  if (!isDirectory(instancesRoot)) return [];
  return readdirSync(instancesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

function readEnvFile(path: string): Record<string, string | undefined> {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

function readConfig(name: string, path: string): InstanceConfig {
  if (!existsSync(path)) return {};
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError(`Instance "${name}": config.json is not valid JSON`);
  }
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    throw new ConfigError(`Instance "${name}": config.json must be {} (no settings are supported yet)`);
  }
  return parsed.data;
}
