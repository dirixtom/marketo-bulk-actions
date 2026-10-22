import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout } from "node:timers/promises";
import { runCli } from "./cli.ts";

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

const argv = process.argv.slice(2).filter((arg) => arg !== "--");

process.exitCode = await runCli(argv, {
  instancesRoot: join(import.meta.dirname, "..", "instances"),
  fetch: globalThis.fetch,
  confirm,
  output: {
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  },
  now: () => new Date(),
  sleep: (ms) => setTimeout(ms),
});
