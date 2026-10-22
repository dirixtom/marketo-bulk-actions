import type { CampaignAction } from "./commands.ts";
import type { Instance } from "./instance.ts";
import type { MarketoClient } from "./marketo-client.ts";
import type { Output } from "./cli.ts";

export interface RunOptions {
  instance: Instance;
  client: MarketoClient;
  references: string[];
  output: Output;
}

/** The resolve, plan, confirm, act, report flow for one campaign action. */
export async function runCampaignAction(action: CampaignAction, options: RunOptions): Promise<number> {
  const { client, references, output } = options;
  let done = 0;
  for (const reference of references) {
    const id = Number(reference);
    const campaign = await client.getSmartCampaign(id);
    await action.act(client, id);
    done += 1;
    output.log(`done     ${id} ${campaign?.name ?? ""}`);
  }
  output.log(`${done} done · 0 skipped · 0 failed`);
  return 0;
}
