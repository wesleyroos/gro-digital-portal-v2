import SuperJSON from "superjson";

// Strip trailing slash to avoid double-slash in URLs
const PORTAL_URL = (process.env.PORTAL_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const MCP_API_KEY = process.env.MCP_API_KEY ?? "";

console.log(`[api-client] PORTAL_URL: ${PORTAL_URL}`);
console.log(`[api-client] MCP_API_KEY set: ${!!MCP_API_KEY}`);

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${MCP_API_KEY}`,
};

/**
 * Call a tRPC query procedure on the portal.
 * tRPC v11 with superjson: GET /api/trpc/<procedure>?input={json:<data>}
 */
export async function trpcQuery<T = unknown>(
  procedure: string,
  input?: unknown
): Promise<T> {
  let url = `${PORTAL_URL}/api/trpc/${procedure}`;

  if (input !== undefined) {
    const serialized = SuperJSON.serialize(input);
    url += `?input=${encodeURIComponent(JSON.stringify(serialized))}`;
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`tRPC query ${procedure} failed (${res.status}): ${text}`);
  }

  const body = await res.json();
  const data = body?.result?.data;
  if (data && "json" in data) {
    return SuperJSON.deserialize(data) as T;
  }
  return data as T;
}

/**
 * Call a tRPC mutation procedure on the portal.
 * tRPC v11 with superjson: POST /api/trpc/<procedure> body={json:<data>}
 */
export async function trpcMutation<T = unknown>(
  procedure: string,
  input?: unknown
): Promise<T> {
  const url = `${PORTAL_URL}/api/trpc/${procedure}`;
  const serialized = input !== undefined ? SuperJSON.serialize(input) : { json: {} };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(serialized),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`tRPC mutation ${procedure} failed (${res.status}): ${text}`);
  }

  const body = await res.json();
  const data = body?.result?.data;
  if (data && "json" in data) {
    return SuperJSON.deserialize(data) as T;
  }
  return data as T;
}
