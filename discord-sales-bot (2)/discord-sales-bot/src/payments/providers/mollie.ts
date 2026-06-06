import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { fetchJson, parseWebhookBody, publicUrl, statusFromWords } from "./helpers.js";

type MolliePaymentResponse = {
  id?: string;
  status?: string;
  metadata?: { orderId?: string };
  _links?: {
    checkout?: { href?: string };
  };
};

export class MollieProvider implements PaymentProvider {
  readonly id = "mollie";
  readonly label = "Mollie";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.MOLLIE_API_KEY);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.MOLLIE_API_KEY) throw new Error("Mollie requires MOLLIE_API_KEY");
    const methods = this.config.MOLLIE_METHODS?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const response = await fetchJson<MolliePaymentResponse>(this.id, "https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.MOLLIE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: {
          currency: input.order.currency,
          value: centsToDecimal(input.order.totalCents)
        },
        description: `Pedido ${input.order.id}`,
        redirectUrl: publicUrl(input.publicBaseUrl, `/payment/success?orderId=${encodeURIComponent(input.order.id)}`),
        webhookUrl: publicUrl(input.publicBaseUrl, "/webhooks/mollie"),
        method: methods && methods.length === 1 ? methods[0] : methods,
        metadata: {
          orderId: input.order.id,
          discordUserId: input.order.discordUserId
        }
      })
    });

    return {
      provider: this.id,
      reference: response.id ?? input.order.id,
      url: response._links?.checkout?.href ?? null
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    if (!this.config.MOLLIE_API_KEY) throw new Error("Mollie is not configured");
    const body = parseWebhookBody<{ id?: string }>(input);
    if (!body.id) return [];
    const payment = await fetchJson<MolliePaymentResponse>(this.id, `https://api.mollie.com/v2/payments/${encodeURIComponent(body.id)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.MOLLIE_API_KEY}`
      }
    });

    return [
      {
        provider: this.id,
        eventId: `${body.id}:${payment.status ?? "updated"}`,
        eventType: "payment.updated",
        status: statusFromWords(payment.status),
        orderId: payment.metadata?.orderId,
        reference: body.id,
        raw: payment
      }
    ];
  }
}
