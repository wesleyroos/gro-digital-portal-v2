import { createHmac } from "crypto";
import { ENV } from "./_core/env";

const PAYSTACK_BASE = "https://api.paystack.co";

export type PaystackMode = "live" | "test";

export async function getPaystackMode(): Promise<PaystackMode> {
  const { getSetting } = await import("./db");
  const mode = await getSetting("paystack_mode");
  return mode === "test" ? "test" : "live";
}

export async function getPaystackKeys(): Promise<{ secretKey: string; publicKey: string; mode: PaystackMode }> {
  const mode = await getPaystackMode();
  if (mode === "test") {
    return { secretKey: ENV.paystackSecretKeyTest, publicKey: ENV.paystackPublicKeyTest, mode };
  }
  return { secretKey: ENV.paystackSecretKey, publicKey: ENV.paystackPublicKey, mode };
}

async function paystackRequest(method: string, path: string, body?: object) {
  const { secretKey } = await getPaystackKeys();
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json() as { status: boolean; message: string; data: any };
  if (!data.status) throw new Error(`Paystack error: ${data.message}`);
  return data.data;
}

/**
 * Initialize a Paystack transaction. Returns access_code for the inline widget.
 * Amount must be in cents (ZAR: R149 → 14900).
 */
export async function initializeTransaction(opts: {
  email: string;
  amount: number;
  reference: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
}): Promise<{ access_code: string; authorization_url: string; reference: string }> {
  return paystackRequest("POST", "/transaction/initialize", {
    email: opts.email,
    amount: opts.amount,
    reference: opts.reference,
    metadata: opts.metadata,
    callback_url: opts.callbackUrl,
  });
}

/**
 * Charge a stored authorization code (recurring billing).
 * Amount must be in cents.
 */
export async function chargeAuthorization(opts: {
  authCode: string;
  email: string;
  amount: number;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<{ status: string; reference: string; gateway_response: string }> {
  return paystackRequest("POST", "/transaction/charge_authorization", {
    authorization_code: opts.authCode,
    email: opts.email,
    amount: opts.amount,
    reference: opts.reference,
    metadata: opts.metadata,
  });
}

/**
 * Verify a Paystack webhook signature.
 * Tries the active mode's key first, then falls back to the other mode's key
 * to handle in-flight transactions when the mode is switched.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const keys = [ENV.paystackSecretKey, ENV.paystackSecretKeyTest].filter(Boolean);
  return keys.some(secret => {
    const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
    return hash === signature;
  });
}

/** Convert ZAR rands to kobo/cents (Paystack smallest unit). */
export function randsToCents(rands: number): number {
  return Math.round(rands * 100);
}
