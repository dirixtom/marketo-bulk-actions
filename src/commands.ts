import type { MarketoClient } from "./marketo-client.ts";

/** One bulk action on smart campaigns, handed to the campaign action runner. */
export interface CampaignAction {
  command: string;
  /** `isActive` once the action has succeeded. */
  targetActive: boolean;
  /** Infinitive, lower case, e.g. "activate". */
  verb: string;
  act: (client: MarketoClient, id: number) => Promise<void>;
}

export const campaignActions: Record<string, CampaignAction> = {
  "campaigns:activate": {
    command: "campaigns:activate",
    targetActive: true,
    verb: "activate",
    act: (client, id) => client.activateSmartCampaign(id),
  },
  "campaigns:deactivate": {
    command: "campaigns:deactivate",
    targetActive: false,
    verb: "deactivate",
    act: (client, id) => client.deactivateSmartCampaign(id),
  },
};
