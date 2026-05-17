import { ENV } from "./_core/env";
import { FlyMachineState, FlyVolume } from "./fly-pricing";

const FLY_MACHINES_API = "https://api.machines.dev/v1";
const FLY_GRAPHQL = "https://api.fly.io/graphql";

function parseOrgTokens(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of ENV.flyOrgTokens.split("|")) {
    const idx = pair.indexOf(":");
    if (idx > 0) map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return map;
}

function flyHeaders(orgSlug?: string): Record<string, string> {
  const token = orgSlug ? (parseOrgTokens().get(orgSlug) ?? "") : "";
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function graphqlToken(): string {
  const tokens = parseOrgTokens();
  return tokens.values().next().value ?? "";
}

export type FlyApp = {
  id: string;
  name: string;
  status: string;
  organization?: { slug?: string };
};

async function listApps(orgSlug: string): Promise<FlyApp[]> {
  const url = `${FLY_MACHINES_API}/apps?org_slug=${encodeURIComponent(orgSlug)}`;
  const res = await fetch(url, { headers: flyHeaders(orgSlug), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fly listApps(${orgSlug}) failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { apps?: FlyApp[] };
  return data.apps ?? [];
}

async function listMachines(appName: string, orgSlug: string): Promise<FlyMachineState[]> {
  const url = `${FLY_MACHINES_API}/apps/${encodeURIComponent(appName)}/machines`;
  try {
    const res = await fetch(url, { headers: flyHeaders(orgSlug), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    return await res.json() as FlyMachineState[];
  } catch {
    return [];
  }
}

async function listVolumes(appName: string, orgSlug: string): Promise<FlyVolume[]> {
  const url = `${FLY_MACHINES_API}/apps/${encodeURIComponent(appName)}/volumes`;
  try {
    const res = await fetch(url, { headers: flyHeaders(orgSlug), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    return await res.json() as FlyVolume[];
  } catch {
    return [];
  }
}

export type OrgCredit = {
  orgSlug: string;
  creditBalanceFormatted: string | null;
};

export async function getOrgCreditBalances(orgSlugs: string[]): Promise<OrgCredit[]> {
  const query = `
    query {
      viewer {
        personalOrganization { slug creditBalanceFormatted }
        organizations { nodes { slug creditBalanceFormatted } }
      }
    }
  `;
  try {
    const res = await fetch(FLY_GRAPHQL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${graphqlToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return orgSlugs.map(s => ({ orgSlug: s, creditBalanceFormatted: null }));
    type GqlOrg = { slug: string; creditBalanceFormatted: string | null };
    const data = await res.json() as {
      data?: {
        viewer?: {
          personalOrganization?: GqlOrg;
          organizations?: { nodes?: GqlOrg[] };
        };
      };
    };
    const viewer = data.data?.viewer;
    const allOrgs: GqlOrg[] = [
      ...(viewer?.personalOrganization ? [viewer.personalOrganization] : []),
      ...(viewer?.organizations?.nodes ?? []),
    ];
    return orgSlugs.map(slug => {
      const found = allOrgs.find(o => o.slug === slug);
      return { orgSlug: slug, creditBalanceFormatted: found?.creditBalanceFormatted ?? null };
    });
  } catch {
    return orgSlugs.map(s => ({ orgSlug: s, creditBalanceFormatted: null }));
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

export type FlyAppDetail = {
  orgSlug: string;
  app: FlyApp;
  machines: FlyMachineState[];
  volumes: FlyVolume[];
};

export async function fetchAllAppsAcrossOrgs(): Promise<FlyAppDetail[]> {
  const orgTokens = parseOrgTokens();
  if (orgTokens.size === 0) throw new Error("FLY_ORG_TOKENS is not set");

  const orgSlugs = ENV.flyOrgSlugs
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (orgSlugs.length === 0) throw new Error("FLY_ORG_SLUGS is not set");

  const configuredSlugs = orgSlugs.filter(s => orgTokens.has(s));
  if (configuredSlugs.length === 0) throw new Error("No matching tokens found for configured orgs");

  const appsByOrg = await Promise.all(
    configuredSlugs.map(async slug => ({ slug, apps: await listApps(slug) }))
  );

  type AppRef = { orgSlug: string; app: FlyApp };
  const refs: AppRef[] = appsByOrg.flatMap(({ slug, apps }) =>
    apps.map(app => ({ orgSlug: slug, app }))
  );

  return runWithConcurrency(refs, 6, async ({ orgSlug, app }) => {
    const [machines, volumes] = await Promise.all([
      listMachines(app.name, orgSlug),
      listVolumes(app.name, orgSlug),
    ]);
    return { orgSlug, app, machines, volumes };
  });
}
