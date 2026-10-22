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
export async function resolveReferences(
  references: string[],
  client: MarketoClient,
  workspace?: string,
): Promise<Resolution[]> {
  const names = references.filter((reference) => !ID_PATTERN.test(reference));
  const catalog = names.length === 0 ? [] : await loadCatalog(names, client, workspace);
  return matchReferences(references, catalog);
}

/**
 * Lists the campaigns once. Campaigns outside a program get their folder name, looked up only
 * when a reference could match them, since that costs two calls per campaign.
 */
async function loadCatalog(names: string[], client: MarketoClient, workspace?: string): Promise<CatalogEntry[]> {
  const catalog: CatalogEntry[] = [];
  for (const campaign of await client.listCampaigns({ workspaceName: workspace })) {
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

/**
 * Matches each reference exactly against the catalog's names and `Parent.Campaign` strings.
 * A campaign several references resolve to is kept once, under the first of them.
 */
export function matchReferences(references: string[], catalog: CatalogEntry[]): Resolution[] {
  const seen = new Set<number>();
  return references.map((reference) => matchReference(reference, catalog)).filter((resolution) => {
    if (!("id" in resolution)) return true;
    if (seen.has(resolution.id)) return false;
    seen.add(resolution.id);
    return true;
  });
}

function matchReference(reference: string, catalog: CatalogEntry[]): Resolution {
  if (ID_PATTERN.test(reference)) return { reference, id: Number(reference) };
  const matches = catalog.filter(
    (campaign) =>
      campaign.name === reference ||
      (campaign.parentName !== undefined && `${campaign.parentName}.${campaign.name}` === reference),
  );
  if (matches.length === 1) return { reference, id: matches[0]!.id };
  if (matches.length === 0) return { reference, error: "not found" };
  return { reference, error: `ambiguous, matches: ${matches.map(fullName).join("; ")}` };
}

function fullName(campaign: CatalogEntry): string {
  return campaign.parentName === undefined
    ? `${campaign.name} [ID ${campaign.id}]`
    : `${campaign.parentName}.${campaign.name}`;
}
