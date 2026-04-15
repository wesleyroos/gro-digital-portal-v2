import { ENV } from "./_core/env";

export type GitHubRepoSummary = {
  repoPath: string;          // owner/name
  name: string;              // just the repo name
  branch: string | null;     // default branch
  lastCommitAt: Date | null;
  lastCommitMessage: string | null;
  isPrivate: boolean;
  isArchived: boolean;
};

type GhRepo = {
  name: string;
  full_name: string;
  default_branch?: string | null;
  pushed_at?: string | null;
  private?: boolean;
  archived?: boolean;
};

type GhCommit = {
  commit?: { message?: string; author?: { date?: string } };
};

const GH_API = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gro-digital-portal-sync",
  };
}

async function listRepos(token: string): Promise<GhRepo[]> {
  const all: GhRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${GH_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`;
    const res = await fetch(url, { headers: ghHeaders(token), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub /user/repos failed: ${res.status} ${text}`);
    }
    const batch = await res.json() as GhRepo[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function latestCommit(token: string, fullName: string, branch: string | null): Promise<GhCommit | null> {
  const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : "";
  const url = `${GH_API}/repos/${fullName}/commits?per_page=1${branchParam}`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token), signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const arr = await res.json() as GhCommit[];
    return Array.isArray(arr) && arr[0] ? arr[0] : null;
  } catch {
    return null;
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

export async function fetchGitHubReposForSync(): Promise<GitHubRepoSummary[]> {
  const token = ENV.githubSyncToken;
  if (!token) throw new Error("GITHUB_SYNC_TOKEN (or GITHUB_TOKEN_FOR_DISPATCH) is not set");

  const repos = await listRepos(token);

  const summaries = await runWithConcurrency(repos, 8, async (repo): Promise<GitHubRepoSummary> => {
    const branch = repo.default_branch ?? null;
    const commit = await latestCommit(token, repo.full_name, branch);
    const msg = commit?.commit?.message ?? null;
    const commitDate = commit?.commit?.author?.date ?? repo.pushed_at ?? null;
    return {
      repoPath: repo.full_name,
      name: repo.name,
      branch,
      lastCommitAt: commitDate ? new Date(commitDate) : null,
      lastCommitMessage: msg ? msg.split("\n")[0].slice(0, 512) : null,
      isPrivate: !!repo.private,
      isArchived: !!repo.archived,
    };
  });

  return summaries;
}
