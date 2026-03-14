import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * If the request carries a valid `Authorization: Bearer <MCP_API_KEY>` header
 * (and MCP_API_KEY is configured), return a synthetic admin user so the MCP
 * server can call admin procedures without a browser session cookie.
 */
function authenticateApiKey(req: CreateExpressContextOptions["req"]): User | null {
  const key = ENV.mcpApiKey;
  if (!key) return null;

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  if (token !== key) return null;

  return {
    id: 0,
    openId: "mcp-service",
    name: "MCP Service",
    email: null,
    loginMethod: "api-key",
    role: "superAdmin",
    clientSlug: null,
    passwordHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Try API key auth first (for MCP server), then fall back to cookie auth
  let user: User | null = authenticateApiKey(opts.req);

  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
