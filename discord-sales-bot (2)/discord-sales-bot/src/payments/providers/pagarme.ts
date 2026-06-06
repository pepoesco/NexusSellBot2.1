import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { basicAuth, fetchJson, hmacHex, parseWebhookBody, safeCompare, statusFromWords } from "./helpers.js";
import { getHeader } from "../headers.js";

type PagarmePaymentLinkResponse = {
  id?: string;
  url?: string;
  status?: string;
};

type PagarmeWebhookBody = {
  id?: string;
  event?: string;
  type?: string;
  data?: {
    id?: string;
    code?: string;
    status?: string;
    order?: { id?: string; code?: string; status?: string };
    metadata?: { orderId?: string };
  };
};

export class PagarmeProvider implements PaymentProvider {
  readonly id = "pagarme";
  readonly label = "Pagar.me";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.PAGARME_SECRET_KEY);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.PAGARME_SECRET_KEY) throw new Error("Pagar.me requires PAGARME_SECRET_KEY");
    const methods = (this.config.PAGARME_PAYMENT_METHODS ?? "credit_card,pix,boleto")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const response = await fetchJson<PagarmePaymentLinkResponse>(this.id, `${this.baseUrl()}/paymentlinks`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(this.config.PAGARME_SECRET_KEY),
        "Content-Type": "application/json",
        "User-Agent": "nexus-sell-bot/1.0"
      },
      body: JSON.stringify({
        type: "order",
        name: `Pedido ${input.order.id}`,
        order_code: input.order.id,
        expires_at: input.order.expiresAt,
        max_paid_sessions: 1,
        payment_settings: {
          accepted_payment_methods: methods
        },
        cart_settings: {
          items: [
            {
              name: input.product.name,
              amount: input.order.unitPriceCents,
              description: input.product.description || input.product.name,
              default_quantity: input.order.quantity
            }
          ]
        }
      })
    });

    return {
      provider: this.id,
      reference: response.id ?? input.order.id,
      url: response.url ?? null
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    if (this.config.PAGARME_WEBHOOK_SECRET && input.rawBody) {
      const received = getHeader(input.headers, "x-hub-signature")?.replace(/^sha1=/, "");
      const expected = hmacHex("sha1", this.config.PAGARME_WEBHOOK_SECRET, input.rawBody);
      if (!safeCompare(received, expected)) throw new Error("Invalid Pagar.me webhook signature");
    }

    const body = parseWebhookBody<PagarmeWebhookBody>(input);
    const event = body.event ?? body.type ?? "pagarme.event";
    const data = body.data ?? {};
    const orderId = data.metadata?.orderId ?? data.order?.code ?? data.code;
    const status = (() => {
      if (event === "order.paid") return "paid";
      if (event === "order.payment_failed") return "failed";
      if (event === "charge.refunded") return "refunded";
      if (event === "checkout.canceled") return "expired";
      return statusFromWords(data.order?.status ?? data.status);
    })();

    return [
      {
        provider: this.id,
        eventId: body.id ?? `${event}:${data.id ?? orderId ?? "unknown"}`,
        eventType: event,
        status,
        orderId,
        reference: data.id,
        raw: body
      }
    ];
  }

  private baseUrl(): string {
    return this.config.PAGARME_BASE_URL ?? "https://api.pagar.me/core/v5";
  }
}
