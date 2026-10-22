import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isFile, isSafeName, notFoundError } from "./named-files.ts";

/** Reads `<instance folder>/lists/<list>.csv` into campaign references. */
export function readCampaignList(instanceFolder: string, list: string): string[] {
  const listsFolder = join(instanceFolder, "lists");
  const path = join(listsFolder, `${list}.csv`);
  if (!isSafeName(list) || !isFile(path)) throw notFoundError("list", list, listsFolder, listNames(listsFolder));
  return parseCampaignList(readFileSync(path, "utf8"));
}

/**
 * Every non-empty trimmed CSV cell is a campaign reference. Lines whose first
 * non-space character is `#` are comments.
 */
export function parseCampaignList(text: string): string[] {
  return parseCsv(text)
    .flat()
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === "#" && row.length === 0 && cell.trim() === "") {
      while (i + 1 < text.length && text[i + 1] !== "\n" && text[i + 1] !== "\r") i++;
      cell = "";
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function listNames(listsFolder: string): string[] {
  if (!existsSync(listsFolder)) return [];
  return readdirSync(listsFolder)
    .filter((file) => file.endsWith(".csv"))
    .map((file) => file.slice(0, -".csv".length))
    .sort();
}
