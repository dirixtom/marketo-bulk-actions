import type { Credentials } from "./instance.ts";

export interface SmartCampaign {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  folder?: { id: number; type: string };
  workspace?: string;
}

export interface MarketoClientDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export function createMarketoClient(credentials: Credentials, deps: MarketoClientDeps) {
  const base = `https://${credentials.munchkinId}.mktorest.com`;

  async function getToken(): Promise<string> {
    const url = new URL(`${base}/identity/oauth/token`);
    url.searchParams.set("grant_type", "client_credentials");
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("client_secret", credentials.clientSecret);
    const response = await deps.fetch(url);
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }

  async function call(method: "GET" | "POST", path: string) {
    const token = await getToken();
    const response = await deps.fetch(`${base}/rest${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await response.json()) as { success: boolean; result?: unknown[] };
  }

  return {
    async getSmartCampaign(id: number): Promise<SmartCampaign | null> {
      const body = await call("GET", `/asset/v1/smartCampaign/${id}.json?includeFlowSteps=false`);
      return (body.result?.[0] as SmartCampaign | undefined) ?? null;
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
