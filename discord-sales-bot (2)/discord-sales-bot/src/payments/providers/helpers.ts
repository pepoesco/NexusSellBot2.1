import crypto from "node:crypto";
import type { PaymentProvider } from "../../domain.js";
import { getHeader } from "../headers.js";

type WebhookInput = Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0];

export function basicAuth(username: string, password = ""): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function fetchJson<T>(provider: string, url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${provider} request failed ${response.status}: ${text}`);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function fetchText(provider: string, url: string, init: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${provider} request failed ${response.status}: ${text}`);
  }
  return text;
}

export function parseWebhookBody<T extends Record<string, unknown>>(input: WebhookInput): T {
  if (input.body && typeof input.body === "object") return input.body as T;
  const raw = input.rawBody?.toString("utf8") ?? "";
  if (!raw) return {} as T;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as T;
  }
  return Object.fromEntries(new URLSearchParams(raw)) as T;
}

export function publicUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function hmacHex(algorithm: string, secret: string, body: Buffer | string): string {
  return crypto.createHmac(algorithm, secret).update(body).digest("hex");
}

export function hmacBase64(algorithm: string, secret: string, body: Buffer | string): string {
  return crypto.createHmac(algorithm, secret).update(body).digest("base64");
}

export function safeCompare(received: string | undefined, expected: string): boolean {
  if (!received || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function verifySharedSecret(input: WebhookInput, secret?: string, headerName = "x-nexus-webhook-secret"): void {
  if (!secret) return;
  const provided = getHeader(input.headers, headerName) ?? String(input.query?.secret ?? "");
  if (provided !== secret) {
    throw new Error("Invalid webhook secret");
  }
}

export function statusFromWords(value: unknown): "paid" | "pending" | "failed" | "expired" | "refunded" {
  const status = String(value ?? "").toLowerCase();
  if (["paid", "approved", "authorized", "confirmed", "received", "received_in_cash", "captured", "completed", "succeeded"].includes(status)) {
    return "paid";
  }
  if (["refunded", "refund", "chargeback", "charged_back"].includes(status)) return "refunded";
  if (["expired", "canceled", "cancelled", "voided"].includes(status)) return "expired";
  if (["failed", "rejected", "declined", "denied", "not_authorized"].includes(status)) return "failed";
  return "pending";
}
