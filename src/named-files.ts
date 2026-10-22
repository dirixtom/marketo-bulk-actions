import { existsSync, statSync } from "node:fs";
import { ConfigError } from "./errors.ts";

/** Names usable as an instance folder or list file. No path separators, no leading dot. */
export function isSafeName(name: string): boolean {
  return /^[\w-][\w.-]*$/.test(name);
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

export function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** A missing instance or list, naming the ones that exist. `kind` is singular, lower case. */
export function notFoundError(kind: "instance" | "list", name: string, where: string, available: string[]): ConfigError {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return new ConfigError(
    `${label} "${name}" not found in ${where}. ` +
      (available.length > 0 ? `Available ${kind}s: ${available.join(", ")}` : `No ${kind}s exist yet.`),
  );
}
