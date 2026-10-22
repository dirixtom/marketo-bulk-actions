import { runCli } from "../cli.ts";
import { createFakeMarketo, type FakeMarketo, type FakeMarketoOptions } from "./fake-marketo.ts";
import { createInstancesRoot } from "./instances.ts";

export const FIXED_NOW = new Date("2026-10-22T09:30:00.000Z");

export interface TestRunOptions {
  /** Instances root; defaults to one valid instance named `sec`. */
  instancesRoot?: string;
  /** Fake Marketo to talk to; built from `marketo` options when omitted. */
  fake?: FakeMarketo;
  marketo?: FakeMarketoOptions;
  /** Answer given to the confirm prompt; `undefined` fails the test if asked. */
  confirm?: boolean;
  /** Clock; defaults to always returning `FIXED_NOW`. */
  now?: () => Date;
}

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr interleaved, in order. */
  output: string;
  prompts: string[];
  /** Every duration passed to the injected sleep, in ms. */
  sleeps: number[];
  fake: FakeMarketo;
  instancesRoot: string;
}

/** Runs the CLI entry against a fake Marketo and captures what the operator sees. */
export async function runTestCli(argv: string[], options: TestRunOptions = {}): Promise<TestRunResult> {
  const fake = options.fake ?? createFakeMarketo(options.marketo);
  const instancesRoot = options.instancesRoot ?? createInstancesRoot();
  let stdout = "";
  let stderr = "";
  let output = "";
  const prompts: string[] = [];
  const sleeps: number[] = [];

  const exitCode = await runCli(argv, {
    instancesRoot,
    fetch: fake.fetch,
    confirm: async (question) => {
      prompts.push(question);
      if (options.confirm === undefined) throw new Error(`Unexpected confirm prompt: ${question}`);
      return options.confirm;
    },
    output: {
      log: (line) => {
        stdout += `${line}\n`;
        output += `${line}\n`;
      },
      error: (line) => {
        stderr += `${line}\n`;
        output += `${line}\n`;
      },
    },
    now: options.now ?? (() => FIXED_NOW),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  return { exitCode, stdout, stderr, output, prompts, sleeps, fake, instancesRoot };
}
