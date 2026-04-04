import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";

export async function callPaperclip<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  if (!ENV.paperclipApiUrl) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Paperclip is not configured. Set PAPERCLIP_API_URL and PAPERCLIP_API_KEY.",
    });
  }

  const url = `${ENV.paperclipApiUrl.replace(/\/$/, "")}${path}`;
  const method = options?.method ?? "GET";

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(ENV.paperclipApiKey ? { Authorization: `Bearer ${ENV.paperclipApiKey}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Paperclip API error ${res.status}: ${text}`,
    });
  }

  return res.json() as Promise<T>;
}
