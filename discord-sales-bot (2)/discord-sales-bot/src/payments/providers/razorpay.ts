import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { basicAuth, fetchJson, hmacHex, parseWebhookBody, safeCompare, statusFromWords } from "./helpers.js";
import { getHeader } from "../headers.js";

type RazorpayPaymentLinkResponse = {
  id?: string;
  short_url?: string;
  status?: string;
};

export class RazorpayProvider implements PaymentProvider {
  readonly id = "razorpay";
  readonly label = "Razorpay";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.RAZORPAY_KEY_ID || !this.config.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
    }

    const response = await fetchJson<RazorpayPaymentLinkResponse>(this.id, "https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: basicAuth(this.config.RAZORPAY_KEY_ID, this.config.RAZORPAY_KEY_SECRET),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: input.order.totalCents,
        currency: input.order.currency,
        accept_partial: false,
        reference_id: input.order.id,
        description: `${input.product.name} x${input.order.quantity}`,
        callback_url: `${input.publicBaseUrl.replace(/\/$/, "")}/payment/success?orderId=${encodeURIComponent(input.order.id)}`,
        callback_method: "get",
        notes: {
          orderId: input.order.id,
          discordUserId: input.order.discordUserId
        }
      })
    });

    return {
      provider: this.id,
      reference: response.id ?? input.order.id,
      url: response.short_url ?? null
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    if (this.config.RAZORPAY_WEBHOOK_SECRET && input.rawBody) {
      const expected = hmacHex("sha256", this.config.RAZORPAY_WEBHOOK_SECRET, input.rawBody);
      const received = getHeader(input.headers, "x-razorpay-signature");
      if (!safeCompare(received, expected)) throw new Error("Invalid Razorpay webhook signature");
    }
    const body = parseWebhookBody<{
      event?: string;
      payload?: {
        payment_link?: { entity?: { id?: string; status?: string; reference_id?: string; notes?: { orderId?: string } } };
        payment?: { entity?: { id?: string; status?: string; notes?: { orderId?: string } } };
      };
    }>(input);
    const link = body.payload?.payment_link?.entity;
    const payment = body.payload?.payment?.entity;
    const orderId = link?.reference_id ?? link?.notes?.orderId ?? payment?.notes?.orderId;
    const event = body.event ?? "razorpay.payment.updated";

    return [
      {
        provider: this.id,
        eventId: `${event}:${payment?.id ?? link?.id ?? orderId ?? "unknown"}`,
        eventType: event,
        status: event.includes("paid") || event.includes("captured") ? "paid" : statusFromWords(payment?.status ?? link?.status),
        orderId,
        reference: payment?.id ?? link?.id,
        raw: body
      }
    ];
  }
}
