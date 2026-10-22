export interface FakeCampaign {
  id: number;
  name: string;
  type?: "trigger" | "batch" | "default";
  isActive?: boolean;
  programName?: string;
  workspace?: string;
  folder?: { id: number; type: "Folder" | "Program" };
}

export interface FakeFolder {
  id: number;
  name: string;
  folderType?: string;
}

export interface FakeMarketoOptions {
  munchkinId?: string;
  clientId?: string;
  clientSecret?: string;
  campaigns?: FakeCampaign[];
  folders?: FakeFolder[];
}

export interface RecordedRequest {
  method: string;
  url: URL;
  authorization: string | null;
}

export interface InjectedError {
  method?: string;
  path: string | RegExp;
  code: string;
  message?: string;
  times?: number;
}

interface CampaignState extends Required<Omit<FakeCampaign, "programName" | "folder">> {
  programName?: string;
  folder?: { id: number; type: "Folder" | "Program" };
}

export const FAKE_MUNCHKIN_ID = "123-ABC-456";
export const FAKE_CLIENT_ID = "fake-client-id";
export const FAKE_CLIENT_SECRET = "fake-client-secret";

const ERROR_MESSAGES: Record<string, string> = {
  "601": "Access token invalid",
  "602": "Access token expired",
  "606": "Max rate limit '100' exceeded with in '20' secs",
  "607": "Daily quota reached",
  "610": "Requested resource not found",
  "615": "Concurrent access limit reached",
  "702": "No data found for a given search scenario",
  "709": "Business Rule Violation",
};

/**
 * In-memory Marketo REST API. Answers identity, campaigns, smart campaign,
 * folder and activate/deactivate endpoints from seeded data, records every
 * request, and returns injected error codes on demand.
 */
export function createFakeMarketo(options: FakeMarketoOptions = {}) {
  const munchkinId = options.munchkinId ?? FAKE_MUNCHKIN_ID;
  const clientId = options.clientId ?? FAKE_CLIENT_ID;
  const clientSecret = options.clientSecret ?? FAKE_CLIENT_SECRET;
  const host = `${munchkinId}.mktorest.com`.toLowerCase();

  const campaigns = new Map<number, CampaignState>();
  for (const c of options.campaigns ?? []) {
    campaigns.set(c.id, {
      id: c.id,
      name: c.name,
      type: c.type ?? "trigger",
      isActive: c.isActive ?? false,
      workspace: c.workspace ?? "Default",
      programName: c.programName,
      folder: c.folder,
    });
  }
  const folders = new Map((options.folders ?? []).map((f) => [f.id, f]));

  const requests: RecordedRequest[] = [];
  const injected: InjectedError[] = [];
  const issuedTokens = new Set<string>();
  let tokenCounter = 0;

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  function failure(code: string, message?: string): Response {
    return json({
      requestId: "fake#1",
      success: false,
      errors: [{ code, message: message ?? ERROR_MESSAGES[code] ?? "Error" }],
    });
  }

  function ok(result: unknown[], extra: Record<string, unknown> = {}): Response {
    return json({ requestId: "fake#1", success: true, result, ...extra });
  }

  function takeInjected(method: string, path: string): InjectedError | undefined {
    const index = injected.findIndex(
      (e) =>
        (e.method === undefined || e.method === method) &&
        (typeof e.path === "string" ? e.path === path : e.path.test(path)),
    );
    if (index === -1) return undefined;
    const match = injected[index]!;
    if (match.times !== undefined) {
      match.times -= 1;
      if (match.times <= 0) injected.splice(index, 1);
    }
    return match;
  }

  function smartCampaignRecord(c: CampaignState) {
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      isActive: c.isActive,
      isSystem: false,
      status: c.isActive ? "Active" : "Inactive",
      workspace: c.workspace,
      ...(c.folder ? { folder: c.folder } : {}),
    };
  }

  function setActive(id: number, active: boolean): Response {
    const c = campaigns.get(id);
    if (!c) return failure("702");
    if (c.type !== "trigger") return failure("709", "Cannot activate a non-trigger campaign");
    if (c.isActive === active) {
      return failure("709", active ? "Campaign is already active" : "Campaign is already inactive");
    }
    c.isActive = active;
    return ok([{ id }]);
  }

  let inFlight = 0;
  let maxInFlight = 0;

  /** Answers a REST request one macrotask later, so concurrent callers overlap as on a real network. */
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const restCall = new URL(input instanceof Request ? input.url : input).pathname.startsWith("/rest/");
    if (!restCall) return answer(input, init);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      return answer(input, init);
    } finally {
      inFlight -= 1;
    }
  };

  function answer(input: string | URL | Request, init?: RequestInit): Response {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    requests.push({ method, url, authorization: request.headers.get("authorization") });

    if (url.host !== host) throw new TypeError(`fetch failed: unknown host ${url.host}`);
    const path = url.pathname;

    if (path === "/identity/oauth/token") {
      const p = url.searchParams;
      if (
        p.get("grant_type") !== "client_credentials" ||
        p.get("client_id") !== clientId ||
        p.get("client_secret") !== clientSecret
      ) {
        return json({ error: "unauthorized", error_description: "Bad client credentials" }, 401);
      }
      tokenCounter += 1;
      const token = `fake-token-${tokenCounter}`;
      issuedTokens.add(token);
      return json({ access_token: token, token_type: "bearer", expires_in: 3599, scope: "api@example.com" });
    }

    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (!issuedTokens.has(token) || url.searchParams.has("access_token")) return failure("601");

    const injectedError = takeInjected(method, path);
    if (injectedError) return failure(injectedError.code, injectedError.message);

    let m: RegExpMatchArray | null;

    if (method === "GET" && (m = path.match(/^\/rest\/asset\/v1\/smartCampaign\/(\d+)\.json$/))) {
      const c = campaigns.get(Number(m[1]));
      return c ? ok([smartCampaignRecord(c)]) : failure("702");
    }
    if (method === "POST" && (m = path.match(/^\/rest\/asset\/v1\/smartCampaign\/(\d+)\/activate\.json$/))) {
      return setActive(Number(m[1]), true);
    }
    if (method === "POST" && (m = path.match(/^\/rest\/asset\/v1\/smartCampaign\/(\d+)\/deactivate\.json$/))) {
      return setActive(Number(m[1]), false);
    }
    if (method === "GET" && path === "/rest/v1/campaigns.json") {
      const workspaceNames = url.searchParams.get("workspaceName")?.split(",");
      const all = [...campaigns.values()].filter(
        (c) => !workspaceNames || workspaceNames.includes(c.workspace),
      );
      const batchSize = Number(url.searchParams.get("batchSize") ?? 300);
      const offset = Number(url.searchParams.get("nextPageToken") ?? 0);
      const page = all.slice(offset, offset + batchSize).map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        workspaceName: c.workspace,
        ...(c.programName ? { programName: c.programName } : {}),
        active: c.isActive,
      }));
      const next = offset + batchSize < all.length ? { nextPageToken: String(offset + batchSize) } : {};
      return ok(page, next);
    }
    if (method === "GET" && (m = path.match(/^\/rest\/asset\/v1\/folder\/(\d+)\.json$/))) {
      const f = folders.get(Number(m[1]));
      return f ? ok([{ id: f.id, name: f.name, folderType: f.folderType ?? "Folder" }]) : failure("702");
    }
    if (method === "GET" && path === "/rest/asset/v1/folders.json") {
      return ok(
        [...folders.values()].map((f) => ({ id: f.id, name: f.name, folderType: f.folderType ?? "Folder" })),
      );
    }

    return failure("610");
  }

  return {
    fetch: fakeFetch as typeof fetch,
    requests,
    /** Requests to REST endpoints, excluding the identity call. */
    restRequests: () => requests.filter((r) => r.url.pathname.startsWith("/rest/")),
    tokenRequests: () => requests.filter((r) => r.url.pathname === "/identity/oauth/token"),
    campaign: (id: number) => campaigns.get(id),
    /** The most REST requests that were in flight at the same time. */
    maxConcurrentRequests: () => maxInFlight,
    /** Make matching calls return `success:false` with this code (once by default). */
    failWith: (error: InjectedError) => injected.push({ times: 1, ...error }),
  };
}

export type FakeMarketo = ReturnType<typeof createFakeMarketo>;
