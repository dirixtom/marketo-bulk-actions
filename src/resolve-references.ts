import type { MarketoClient } from "./marketo-client.ts";

export type Resolution = { reference: string; id: number } | { reference: string; error: string };

/** A campaign that name references can match. `parentName` is the program, or the folder outside programs. */
export interface CatalogEntry {
  id: number;
  name: string;
  parentName?: string;
}

const ID_PATTERN = /^\d+$/;

/** Turns campaign references into smart campaign IDs, fetching the campaign catalog only for names. */
export async function resolveReferences(references: string[], client: MarketoClient): Promise<Resolution[]> {
  const names = references.filter((reference) => !ID_PATTERN.test(reference));
  const catalog = names.length === 0 ? [] : await loadCatalog(names, client);
  return matchReferences(references, catalog);
}

/**
 * Lists the campaigns once. Campaigns outside a program get their folder name, looked up only
 * when a reference could match them, since that costs two calls per campaign.
 */
async function loadCatalog(names: string[], client: MarketoClient): Promise<CatalogEntry[]> {
  const catalog: CatalogEntry[] = [];
  for (const campaign of await client.listCampaigns()) {
    const entry: CatalogEntry = { id: campaign.id, name: campaign.name, parentName: campaign.programName };
    const mayMatch = names.some((name) => name === campaign.name || name.endsWith(`.${campaign.name}`));
    if (entry.parentName === undefined && mayMatch) entry.parentName = await folderName(campaign.id, client);
    catalog.push(entry);
  }
  return catalog;
}

async function folderName(id: number, client: MarketoClient): Promise<string | undefined> {
  const folder = (await client.getSmartCampaign(id))?.folder;
  if (folder?.type !== "Folder") return undefined;
  return (await client.getFolderName(folder.id)) ?? undefined;
}

/** Matches each reference exactly against the catalog's names and `Parent.Campaign` strings. */
export function matchReferences(references: string[], catalog: CatalogEntry[]): Resolution[] {
  return references.map((reference): Resolution => {
    if (ID_PATTERN.test(reference)) return { reference, id: Number(reference) };
    const matches = catalog.filter(
      (campaign) =>
        campaign.name === reference ||
        (campaign.parentName !== undefined && `${campaign.parentName}.${campaign.name}` === reference),
    );
    if (matches.length === 1) return { reference, id: matches[0]!.id };
    return { reference, error: "not found" };
  });
}
