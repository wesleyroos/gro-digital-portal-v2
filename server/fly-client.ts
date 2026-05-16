import { ENV } from "./_core/env";
import { FlyMachineState, FlyVolume } from "./fly-pricing";

const FLY_MACHINES_API = "https://api.machines.dev/v1";
const FLY_GRAPHQL = "https://api.fly.io/graphql";

function flyHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${ENV.flyApiToken}`,
    "Content-Type": "application/json",
  };
}

export type FlyApp = {
  id: string;
  name: string;
  status: string;
  organization?: { slug?: string };
};

async function listApps(orgSlug: string): Promise<FlyApp[]> {
  const url = `${FLY_MACHINES_API}/apps?org_slug=${encodeURIComponent(orgSlug)}`;
  const res = await fetch(url, { headers: flyHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fly listApps(${orgSlug}) failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { apps?: FlyApp[] };
  return data.apps ?? [];
}

async function listMachines(appName: string): Promise<FlyMachineState[]> {
  const url = `${FLY_MACHINES_API}/apps/${encodeURIComponent(appName)}/machines`;
  try {
    const res = await fetch(url, { headers: flyHeaders(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    return await res.json() as FlyMachineState[];
  } catch {
    return [];
  }
}

async function listVolumes(appName: string): Promise<FlyVolume[]> {
  const url = `${FLY_MACHINES_API}/apps/${encodeURIComponent(appName)}/volumes`;
  try {
    const res = await fetch(url, { headers: flyHeaders(), signal: AbortSignal.timeout(15_000) });
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
      headers: flyHeaders(),
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
  const token = ENV.flyApiToken;
  if (!token) throw new Error("FLY_API_TOKEN is not set");

  const orgSlugs = ENV.flyOrgSlugs
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (orgSlugs.length === 0) throw new Error("FLY_ORG_SLUGS is not set");

  const appsByOrg = await Promise.all(
    orgSlugs.map(async slug => ({ slug, apps: await listApps(slug) }))
  );

  type AppRef = { orgSlug: string; app: FlyApp };
  const refs: AppRef[] = appsByOrg.flatMap(({ slug, apps }) =>
    apps.map(app => ({ orgSlug: slug, app }))
  );

  return runWithConcurrency(refs, 6, async ({ orgSlug, app }) => {
    const [machines, volumes] = await Promise.all([
      listMachines(app.name),
      listVolumes(app.name),
    ]);
    return { orgSlug, app, machines, volumes };
  });
}
