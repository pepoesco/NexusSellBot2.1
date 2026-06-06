import crypto from "node:crypto";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { getHeader } from "../headers.js";

export function verifyMercadoPagoSignature(input: {
  signatureHeader?: string;
  requestId?: string;
  dataId?: string;
  secret?: string;
}): boolean {
  if (!input.secret) return true;
  if (!input.signatureHeader) return false;

  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((part) => {
      const [key, value] = part.trim().split("=");
      return [key, value];
    })
  );
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;

  const template = [
    input.dataId ? `id:${input.dataId};` : "",
    input.requestId ? `request-id:${input.requestId};` : "",
    `ts:${ts};`
  ].join("");
  const expected = crypto.createHmac("sha256", input.secret).update(template).digest("hex");
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly id = "mercadopago";
  readonly label = "Mercado Pago";
  readonly enabled: boolean;
  private readonly client: MercadoPagoConfig | null;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.MERCADOPAGO_ACCESS_TOKEN);
    this.client = config.MERCADOPAGO_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: config.MERCADOPAGO_ACCESS_TOKEN }) : null;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.client) {
      throw new Error("Mercado Pago is not configured");
    }

    const preference = new Preference(this.client);
    const response = (await preference.create({
      body: {
        external_reference: input.order.id,
        notification_url: `${input.publicBaseUrl}/webhooks/mercadopago`,
        items: [
          {
            id: input.product.sku,
            title: input.product.name,
            description: input.product.description,
            quantity: input.order.quantity,
            currency_id: input.order.currency,
            unit_price: Number(centsToDecimal(input.order.unitPriceCents))
          }
        ],
        back_urls: {
          success: `${input.publicBaseUrl}/payment/success?orderId=${encodeURIComponent(input.order.id)}`,
          failure: `${input.publicBaseUrl}/payment/cancel?orderId=${encodeURIComponent(input.order.id)}`,
          pending: `${input.publicBaseUrl}/payment/pending?orderId=${encodeURIComponent(input.order.id)}`
        },
        auto_return: "approved"
      }
    })) as { id?: string; init_point?: string; sandbox_init_point?: string };

    return {
      provider: this.id,
      reference: response.id ?? input.order.id,
      url: response.init_point ?? response.sandbox_init_point ?? null
    };
  }

  async handleWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, unknown>;
  }): Promise<PaymentUpdate[]> {
    if (!this.client) {
      throw new Error("Mercado Pago is not configured");
    }

    const body = input.body as { action?: string; type?: string; data?: { id?: string }; id?: string } | undefined;
    const queryDataId = String(input.query?.["data.id"] ?? input.query?.id ?? body?.data?.id ?? "");
    const signatureHeader = getHeader(input.headers, "x-signature");
    const requestId = getHeader(input.headers, "x-request-id");
    const valid = verifyMercadoPagoSignature({
      signatureHeader,
      requestId,
      dataId: queryDataId,
      secret: this.config.MERCADOPAGO_WEBHOOK_SECRET
    });
    if (!valid) {
      throw new Error("Invalid Mercado Pago signature");
    }

    if ((body?.type ?? input.query?.type) !== "payment" || !queryDataId) {
      return [];
    }

    const paymentClient = new Payment(this.client);
    const payment = (await paymentClient.get({ id: queryDataId })) as {
      id?: number | string;
      status?: string;
      external_reference?: string;
      order?: { id?: string };
    };

    const status = (() => {
      if (payment.status === "approved" || payment.status === "authorized") return "paid";
      if (payment.status === "rejected" || payment.status === "cancelled") return "failed";
      if (payment.status === "refunded" || payment.status === "charged_back") return "refunded";
      return "pending";
    })();

    return [
      {
        provider: this.id,
        eventId: String(payment.id ?? queryDataId),
        eventType: body?.action ?? "payment.updated",
        status,
        orderId: payment.external_reference,
        reference: String(payment.id ?? queryDataId),
        raw: payment
      }
    ];
  }
}
