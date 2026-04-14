import crypto from "crypto";
import { ENV } from "./_core/env";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function secret(): string {
  if (!ENV.feedbackApprovalSecret) {
    throw new Error("FEEDBACK_APPROVAL_SECRET env var is not set");
  }
  return ENV.feedbackApprovalSecret;
}

export function signApprovalToken(approvalId: number, action: "approve" | "dismiss"): string {
  const payload = JSON.stringify({ aid: approvalId, act: action, exp: Date.now() + TOKEN_TTL_MS });
  const body = b64url(Buffer.from(payload, "utf8"));
  const sig = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifiedToken = { approvalId: number; action: "approve" | "dismiss" };

export function verifyApprovalToken(token: string): VerifiedToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(fromB64url(body).toString("utf8")) as { aid: number; act: "approve" | "dismiss"; exp: number };
    if (!parsed || typeof parsed.aid !== "number" || (parsed.act !== "approve" && parsed.act !== "dismiss")) return null;
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    return { approvalId: parsed.aid, action: parsed.act };
  } catch {
    return null;
  }
}

export type DispatchPayload = {
  approvalId: number;
  type: "bug" | "feature";
  title: string;
  description: string;
  currentUrl: string | null;
  userName: string | null;
  userRole: string | null;
};

export async function triggerGitHubDispatch(payload: DispatchPayload): Promise<void> {
  if (!ENV.githubToken) throw new Error("GITHUB_TOKEN_FOR_DISPATCH env var is not set");
  const url = `https://api.github.com/repos/${ENV.githubRepoOwner}/${ENV.githubRepoName}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ENV.githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "gro-digital-portal",
    },
    body: JSON.stringify({
      event_type: "feedback-approved",
      client_payload: payload,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub dispatch failed: ${res.status} ${text}`);
  }
}

export function approvalLink(baseUrl: string, approvalId: number, action: "approve" | "dismiss"): string {
  const token = signApprovalToken(approvalId, action);
  const path = action === "approve" ? "approve" : "dismiss";
  return `${baseUrl.replace(/\/$/, "")}/api/feedback/${path}?token=${encodeURIComponent(token)}`;
}
