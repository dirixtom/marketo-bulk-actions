/** A problem with flags, the instance folder or credentials. Exits 2 before acting. */
export class ConfigError extends Error {
  override name = "ConfigError";
}
