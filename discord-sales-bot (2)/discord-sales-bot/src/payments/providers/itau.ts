import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { getHeader } from "../headers.js";

type ItauTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type ItauQrCodeResponse = {
  emv?: string;
  pix_link?: string;
  qrcode?: string;
  imagemQrcode?: string;
};

type ItauRequestOptions = {
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  form?: URLSearchParams;
};

export class ItauProvider implements PaymentProvider {
  readonly id = "itau";
  readonly label = "Itau Pix";
  readonly enabled: boolean;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfig) {
    const hasCredentials = Boolean(config.ITAU_CLIENT_ID && config.ITAU_CLIENT_SECRET && config.ITAU_PIX_KEY);
    const hasMtls = Boolean((config.ITAU_CERT_PATH && config.ITAU_KEY_PATH) || (config.ITAU_CERT_BASE64 && config.ITAU_KEY_BASE64));
    this.enabled = hasCredentials && (config.ITAU_ENV === "sandbox" || hasMtls);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.ITAU_PIX_KEY) {
      throw new Error("Itau Pix requires ITAU_PIX_KEY");
    }

    const token = await this.accessToken();
    const txid = input.order.id.replaceAll("-", "").slice(0, 35);
    const expirationSeconds = Math.max(60, Math.floor((new Date(input.order.expiresAt).getTime() - Date.now()) / 1000));
    await this.apiRequest<unknown>(`/cob/${txid}`, {
      method: "PUT",
      headers: this.authHeaders(token),
      body: {
        calendario: {
          expiracao: expirationSeconds
        },
        valor: {
          original: centsToDecimal(input.order.totalCents)
        },
        chave: this.config.ITAU_PIX_KEY,
        solicitacaoPagador: `Pedido ${input.order.id}`,
        infoAdicionais: [
          { nome: "Pedido", valor: input.order.id },
          { nome: "Discord", valor: input.order.discordUserId }
        ]
      }
    });

    const qr = await this.apiRequest<ItauQrCodeResponse>(`/cob/${txid}/qrcode`, {
      method: "GET",
      headers: this.authHeaders(token)
    });

    const copyPaste = qr.emv ?? qr.qrcode ?? null;
    const instructions = [
      `Pedido ${input.order.id}`,
      `Valor: ${input.order.currency} ${centsToDecimal(input.order.totalCents)}`,
      "Pix Itau copia e cola:",
      copyPaste ?? "Cobranca criada, mas o endpoint de QR Code nao retornou EMV.",
      qr.pix_link ? `Link Pix: ${qr.pix_link}` : null
    ]
      .filter(Boolean)
      .join("\n");

    return {
      provider: this.id,
      reference: txid,
      url: qr.pix_link ?? null,
      instructions
    };
  }

  async handleWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, unknown>;
  }): Promise<PaymentUpdate[]> {
    if (this.config.ITAU_WEBHOOK_SECRET) {
      const provided = getHeader(input.headers, "x-nexus-webhook-secret") ?? String(input.query?.secret ?? "");
      if (provided !== this.config.ITAU_WEBHOOK_SECRET) {
        throw new Error("Invalid Itau webhook secret");
      }
    }

    const body = input.body as { pix?: Array<{ endToEndId?: string; txid?: string; valor?: string; horario?: string }> };
    return (body.pix ?? [])
      .filter((pix) => Boolean(pix.txid))
      .map((pix) => ({
        provider: this.id,
        eventId: pix.endToEndId ?? `${pix.txid}:${pix.horario ?? "paid"}`,
        eventType: "pix.received",
        status: "paid",
        reference: pix.txid,
        raw: pix
      }));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    if (!this.config.ITAU_CLIENT_ID || !this.config.ITAU_CLIENT_SECRET) {
      throw new Error("Itau credentials are not configured");
    }

    const response = await this.requestJson<ItauTokenResponse>(this.tokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      form: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.ITAU_CLIENT_ID,
        client_secret: this.config.ITAU_CLIENT_SECRET
      })
    });

    this.token = {
      value: response.access_token,
      expiresAt: Date.now() + (response.expires_in ?? 300) * 1000
    };
    return response.access_token;
  }

  private async apiRequest<T>(route: string, options: ItauRequestOptions): Promise<T> {
    const url = `${this.pixBaseUrl()}${route}`;
    return this.requestJson<T>(url, options);
  }

  private async requestJson<T>(url: string, options: ItauRequestOptions): Promise<T> {
    const parsed = new URL(url);
    const body = options.form?.toString() ?? (options.body ? JSON.stringify(options.body) : undefined);
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
      ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {})
    };
    const mtls = this.mtlsOptions();

    return new Promise<T>((resolve, reject) => {
      const client = parsed.protocol === "https:" ? https : http;
      const request = client.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port,
          path: `${parsed.pathname}${parsed.search}`,
          method: options.method,
          headers,
          timeout: 30_000,
          ...mtls
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if ((response.statusCode ?? 500) >= 400) {
              reject(new Error(`Itau request failed ${response.statusCode}: ${text}`));
              return;
            }
            if (!text) {
              resolve({} as T);
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              resolve(text as T);
            }
          });
        }
      );
      request.on("timeout", () => request.destroy(new Error("Itau request timeout")));
      request.on("error", reject);
      if (body) request.write(body);
      request.end();
    });
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "x-itau-flowID": randomUUID(),
      "x-itau-correlationID": randomUUID()
    };
  }

  private mtlsOptions(): { cert?: Buffer; key?: Buffer; passphrase?: string } {
    if (this.config.ITAU_CERT_BASE64 && this.config.ITAU_KEY_BASE64) {
      return {
        cert: Buffer.from(this.config.ITAU_CERT_BASE64, "base64"),
        key: Buffer.from(this.config.ITAU_KEY_BASE64, "base64"),
        passphrase: this.config.ITAU_CERT_PASSPHRASE
      };
    }
    if (!this.config.ITAU_CERT_PATH || !this.config.ITAU_KEY_PATH) {
      return {};
    }
    return {
      cert: fs.readFileSync(path.resolve(process.cwd(), this.config.ITAU_CERT_PATH)),
      key: fs.readFileSync(path.resolve(process.cwd(), this.config.ITAU_KEY_PATH)),
      passphrase: this.config.ITAU_CERT_PASSPHRASE
    };
  }

  private tokenUrl(): string {
    return (
      this.config.ITAU_TOKEN_URL ??
      (this.config.ITAU_ENV === "production"
        ? "https://sts.itau.com.br/api/oauth/token"
        : "https://devportal.itau.com.br/api/jwt")
    );
  }

  private pixBaseUrl(): string {
    return (
      this.config.ITAU_PIX_BASE_URL ??
      (this.config.ITAU_ENV === "production"
        ? "https://secure.api.itau/pix_recebimentos/v2"
        : "https://devportal.itau.com.br/sandboxapi/pix_recebimentos_ext_v2/v2")
    );
  }
}
