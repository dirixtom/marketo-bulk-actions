import type { Credentials } from "./instance.ts";

export interface SmartCampaign {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  folder?: { id: number; type: string };
  workspace?: string;
}

/** A campaign as listed by the Lead Database API. `programName` is absent outside programs. */
export interface CatalogCampaign {
  id: number;
  name: string;
  programName?: string;
  workspaceName?: string;
}

export interface MarketoClientDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

interface MarketoResponse {
  success: boolean;
  result?: unknown[];
  errors?: { code: string; message: string }[];
  warnings?: string[];
  nextPageToken?: string;
}

/** A `success:false` response, carrying Marketo's first error code and message. */
export class MarketoApiError extends Error {
  override name = "MarketoApiError";
  constructor(
    readonly code: string,
    readonly marketoMessage: string,
  ) {
    super(`${code} ${marketoMessage}`);
  }
}

/** The identity endpoint refused the client ID and secret. Ends the run. */
export class MarketoAuthError extends Error {
  override name = "MarketoAuthError";
  constructor(readonly status: number) {
    super(`Marketo identity endpoint returned HTTP ${status}`);
  }
}

const NOT_FOUND_CODES = new Set(["702", "610"]);
/** Invalid or expired access token: fetch a new one and retry once. */
const TOKEN_CODES = new Set(["601", "602"]);
/** Rate limit (606) or concurrency limit (615) exceeded: back off exponentially and retry. */
const THROTTLE_CODES = new Set(["606", "615"]);
const FIRST_BACKOFF_MS = 2000;
const MAX_THROTTLED_ATTEMPTS = 5;

export function createMarketoClient(credentials: Credentials, deps: MarketoClientDeps) {
  const base = `https://${credentials.munchkinId}.mktorest.com`;
  let token: Promise<string> | undefined;
  const folderNames = new Map<number, Promise<string | null>>();

  function getToken(): Promise<string> {
    token ??= fetchToken();
    return token;
  }

  async function fetchToken(): Promise<string> {
    const url = new URL(`${base}/identity/oauth/token`);
    url.searchParams.set("grant_type", "client_credentials");
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("client_secret", credentials.clientSecret);
    const response = await deps.fetch(url);
    if (!response.ok) throw new MarketoAuthError(response.status);
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new MarketoAuthError(response.status);
    return body.access_token;
  }

  async function call(method: "GET" | "POST", path: string): Promise<MarketoResponse> {
    let reauthenticated = false;
    let throttledAttempts = 0;
    for (;;) {
      const tokenUsed = getToken();
      const response = await deps.fetch(`${base}/rest${path}`, {
        method,
        headers: { Authorization: `Bearer ${await tokenUsed}` },
      });
      const body = (await response.json()) as MarketoResponse;
      if (body.success) return body;
      const error = body.errors?.[0];
      const code = error?.code ?? "unknown";
      if (TOKEN_CODES.has(code) && !reauthenticated) {
        reauthenticated = true;
        // Calls in flight share the token; only the first to see it rejected fetches a new one.
        if (token === tokenUsed) token = undefined;
        continue;
      }
      if (THROTTLE_CODES.has(code) && ++throttledAttempts < MAX_THROTTLED_ATTEMPTS) {
        await deps.sleep(FIRST_BACKOFF_MS * 2 ** (throttledAttempts - 1));
        continue;
      }
      throw new MarketoApiError(code, error?.message ?? "Marketo returned success:false");
    }
  }

  return {
    /** Returns null when Marketo has no smart campaign with this ID. */
    async getSmartCampaign(id: number): Promise<SmartCampaign | null> {
      try {
        const body = await call("GET", `/asset/v1/smartCampaign/${id}.json?includeFlowSteps=false`);
        return (body.result?.[0] as SmartCampaign | undefined) ?? null;
      } catch (error) {
        if (error instanceof MarketoApiError && NOT_FOUND_CODES.has(error.code)) return null;
        throw error;
      }
    },
    /** Every smart campaign in the instance, or in one workspace, from the Lead Database API. */
    async listCampaigns(options: { workspaceName?: string } = {}): Promise<CatalogCampaign[]> {
      const campaigns: CatalogCampaign[] = [];
      let nextPageToken: string | undefined;
      do {
        const query = new URLSearchParams({ batchSize: "300" });
        if (options.workspaceName !== undefined) query.set("workspaceName", options.workspaceName);
        if (nextPageToken !== undefined) query.set("nextPageToken", nextPageToken);
        const body = await call("GET", `/v1/campaigns.json?${query}`);
        for (const record of (body.result ?? []) as CatalogCampaign[]) {
          campaigns.push({
            id: record.id,
            name: record.name,
            programName: record.programName,
            workspaceName: record.workspaceName,
          });
        }
        nextPageToken = body.nextPageToken;
      } while (nextPageToken);
      return campaigns;
    },
    /** Returns null when Marketo has no folder with this ID. */
    getFolderName(id: number): Promise<string | null> {
      let name = folderNames.get(id);
      if (!name) {
        name = call("GET", `/asset/v1/folder/${id}.json?type=Folder`).then(
          (body) => (body.result?.[0] as { name?: string } | undefined)?.name ?? null,
          (error) => {
            if (error instanceof MarketoApiError && NOT_FOUND_CODES.has(error.code)) return null;
            throw error;
          },
        );
        folderNames.set(id, name);
      }
      return name;
    },
    /** The workspaces: the `Zone` folders near the top of the folder tree. */
    async listWorkspaces(): Promise<{ id: number; name: string }[]> {
      const body = await call("GET", "/asset/v1/folders.json?maxDepth=2&maxReturn=200");
      return ((body.result ?? []) as { id: number; name: string; folderType?: string }[])
        .filter((folder) => folder.folderType === "Zone")
        .map(({ id, name }) => ({ id, name }));
    },
    async activateSmartCampaign(id: number): Promise<void> {
      await call("POST", `/asset/v1/smartCampaign/${id}/activate.json`);
    },
    async deactivateSmartCampaign(id: number): Promise<void> {
      await call("POST", `/asset/v1/smartCampaign/${id}/deactivate.json`);
    },
  };
}

export type MarketoClient = ReturnType<typeof createMarketoClient>;
