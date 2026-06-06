import crypto from "node:crypto";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { getHeader } from "../headers.js";

function sign(secret: string, body: Buffer): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export class CustomWebhookProvider implements PaymentProvider {
  readonly id = "custom";
  readonly label = "Webhook custom";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.CUSTOM_WEBHOOK_SECRET || config.CUSTOM_CHECKOUT_URL_TEMPLATE);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const url =
      this.config.CUSTOM_CHECKOUT_URL_TEMPLATE?.replaceAll("{orderId}", encodeURIComponent(input.order.id))
        .replaceAll("{amountCents}", String(input.order.totalCents))
        .replaceAll("{currency}", encodeURIComponent(input.order.currency)) ?? null;

    return {
      provider: this.id,
      reference: input.order.id,
      url,
      instructions: url
        ? "Finalize o pagamento no link acima."
        : `Integre seu banco/adquirente para chamar POST ${input.publicBaseUrl}/webhooks/custom com assinatura HMAC.`
    };
  }

  async handleWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody?: Buffer }): Promise<PaymentUpdate[]> {
    if (!this.config.CUSTOM_WEBHOOK_SECRET) {
      throw new Error("CUSTOM_WEBHOOK_SECRET is required for custom webhook verification");
    }
    const raw = input.rawBody ?? Buffer.from("{}");
    const received = getHeader(input.headers, "x-sales-signature");
    const expected = sign(this.config.CUSTOM_WEBHOOK_SECRET, raw);
    if (!received || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
      throw new Error("Invalid custom webhook signature");
    }

    const body = JSON.parse(raw.toString("utf8")) as {
      orderId?: string;
      reference?: string;
      status?: PaymentUpdate["status"];
      eventId?: string;
      eventType?: string;
    };
    if (!body.status || (!body.orderId && !body.reference)) {
      throw new Error("Custom webhook requires status and orderId or reference");
    }

    return [
      {
        provider: this.id,
        eventId: body.eventId ?? `${body.reference ?? body.orderId}:${body.status}`,
        eventType: body.eventType ?? "custom.payment.updated",
        status: body.status,
        orderId: body.orderId,
        reference: body.reference,
        raw: body
      }
    ];
  }
}
