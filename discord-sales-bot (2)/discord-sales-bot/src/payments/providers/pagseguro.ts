import { XMLParser } from "fast-xml-parser";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { fetchText, parseWebhookBody } from "./helpers.js";

type PagSeguroCheckout = {
  checkout?: {
    code?: string;
  };
};

type PagSeguroTransaction = {
  transaction?: {
    code?: string;
    reference?: string;
    status?: number | string;
  };
};

export class PagSeguroProvider implements PaymentProvider {
  readonly id = "pagseguro";
  readonly label = "PagSeguro";
  readonly enabled: boolean;
  private readonly parser = new XMLParser();

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.PAGSEGURO_EMAIL && config.PAGSEGURO_TOKEN);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.PAGSEGURO_EMAIL || !this.config.PAGSEGURO_TOKEN) {
      throw new Error("PagSeguro requires PAGSEGURO_EMAIL and PAGSEGURO_TOKEN");
    }

    const form = new URLSearchParams({
      email: this.config.PAGSEGURO_EMAIL,
      token: this.config.PAGSEGURO_TOKEN,
      currency: input.order.currency,
      reference: input.order.id,
      itemId1: input.product.sku,
      itemDescription1: input.product.name.slice(0, 100),
      itemAmount1: centsToDecimal(input.order.unitPriceCents),
      itemQuantity1: String(input.order.quantity),
      notificationURL: `${input.publicBaseUrl.replace(/\/$/, "")}/webhooks/pagseguro`
    });

    const xml = await fetchText(this.id, `${this.baseWsUrl()}/v2/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: form
    });
    const parsed = this.parser.parse(xml) as PagSeguroCheckout;
    const code = parsed.checkout?.code;
    if (!code) throw new Error(`PagSeguro did not return checkout code: ${xml}`);

    return {
      provider: this.id,
      reference: code,
      url: `${this.checkoutUrl()}/v2/checkout/payment.html?code=${encodeURIComponent(code)}`
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    if (!this.config.PAGSEGURO_EMAIL || !this.config.PAGSEGURO_TOKEN) {
      throw new Error("PagSeguro is not configured");
    }

    const body = parseWebhookBody<{ notificationCode?: string; notificationType?: string }>(input);
    if (!body.notificationCode || body.notificationType !== "transaction") return [];

    const xml = await fetchText(
      this.id,
      `${this.baseWsUrl()}/v3/transactions/notifications/${encodeURIComponent(body.notificationCode)}?${new URLSearchParams({
        email: this.config.PAGSEGURO_EMAIL,
        token: this.config.PAGSEGURO_TOKEN
      })}`,
      { method: "GET" }
    );
    const parsed = this.parser.parse(xml) as PagSeguroTransaction;
    const transaction = parsed.transaction ?? {};
    const statusCode = Number(transaction.status);
    const status = (() => {
      if ([3, 4].includes(statusCode)) return "paid";
      if ([6].includes(statusCode)) return "refunded";
      if ([7].includes(statusCode)) return "failed";
      return "pending";
    })();

    return [
      {
        provider: this.id,
        eventId: body.notificationCode,
        eventType: "transaction.notification",
        status,
        orderId: transaction.reference,
        reference: transaction.code,
        raw: parsed
      }
    ];
  }

  private baseWsUrl(): string {
    return this.config.PAGSEGURO_ENV === "production"
      ? "https://ws.pagseguro.uol.com.br"
      : "https://ws.sandbox.pagseguro.uol.com.br";
  }

  private checkoutUrl(): string {
    return this.config.PAGSEGURO_ENV === "production"
      ? "https://pagseguro.uol.com.br"
      : "https://sandbox.pagseguro.uol.com.br";
  }
}
