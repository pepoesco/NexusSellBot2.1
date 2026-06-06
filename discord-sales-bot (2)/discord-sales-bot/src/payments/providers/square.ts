import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { fetchJson, hmacBase64, parseWebhookBody, publicUrl, safeCompare, statusFromWords } from "./helpers.js";
import { getHeader } from "../headers.js";

type SquarePaymentLinkResponse = {
  payment_link?: {
    id?: string;
    url?: string;
  };
};

export class SquareProvider implements PaymentProvider {
  readonly id = "square";
  readonly label = "Square";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.SQUARE_ACCESS_TOKEN && config.SQUARE_LOCATION_ID);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.SQUARE_ACCESS_TOKEN || !this.config.SQUARE_LOCATION_ID) {
      throw new Error("Square requires SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID");
    }

    const response = await fetchJson<SquarePaymentLinkResponse>(this.id, `${this.baseUrl()}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2026-05-20"
      },
      body: JSON.stringify({
        idempotency_key: input.order.id,
        quick_pay: {
          name: input.product.name,
          price_money: {
            amount: input.order.totalCents,
            currency: input.order.currency
          },
          location_id: this.config.SQUARE_LOCATION_ID
        },
        checkout_options: {
          redirect_url: publicUrl(input.publicBaseUrl, `/payment/success?orderId=${encodeURIComponent(input.order.id)}`)
        },
        payment_note: input.order.id
      })
    });

    return {
      provider: this.id,
      reference: response.payment_link?.id ?? input.order.id,
      url: response.payment_link?.url ?? null
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    this.verifySignature(input);
    const body = parseWebhookBody<{
      event_id?: string;
      type?: string;
      data?: { id?: string; object?: { payment?: { id?: string; status?: string; note?: string; order_id?: string } } };
    }>(input);
    const payment = body.data?.object?.payment ?? {};
    return [
      {
        provider: this.id,
        eventId: body.event_id ?? `${body.type}:${payment.id ?? body.data?.id}`,
        eventType: body.type ?? "square.payment.updated",
        status: statusFromWords(payment.status),
        orderId: payment.note,
        reference: payment.id ?? payment.order_id,
        raw: body
      }
    ];
  }

  private verifySignature(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): void {
    if (!this.config.SQUARE_WEBHOOK_SIGNATURE_KEY || !input.rawBody) return;
    const notificationUrl = this.config.SQUARE_WEBHOOK_URL ?? `${this.config.PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/square`;
    const expected = hmacBase64("sha256", this.config.SQUARE_WEBHOOK_SIGNATURE_KEY, `${notificationUrl}${input.rawBody.toString("utf8")}`);
    const received = getHeader(input.headers, "x-square-hmacsha256-signature");
    if (!safeCompare(received, expected)) throw new Error("Invalid Square webhook signature");
  }

  private baseUrl(): string {
    return this.config.SQUARE_ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  }
}
