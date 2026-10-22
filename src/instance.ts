import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

export interface Credentials {
  munchkinId: string;
  clientId: string;
  clientSecret: string;
}

export interface Instance {
  name: string;
  folder: string;
  credentials: Credentials;
  config: Record<string, never>;
}

export function loadInstance(name: string, instancesRoot: string): Instance {
  const folder = join(instancesRoot, name);
  const env = parseEnv(readFileSync(join(folder, ".env"), "utf8"));
  return {
    name,
    folder,
    credentials: {
      munchkinId: env.MARKETO_MUNCHKIN_ID ?? "",
      clientId: env.MARKETO_CLIENT_ID ?? "",
      clientSecret: env.MARKETO_CLIENT_SECRET ?? "",
    },
    config: {},
  };
}
