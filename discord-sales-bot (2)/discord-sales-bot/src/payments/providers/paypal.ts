import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { getHeader } from "../headers.js";

type PayPalLink = { href: string; rel: string; method?: string };
type PayPalOrder = {
  id: string;
  status?: string;
  links?: PayPalLink[];
  purchase_units?: Array<{ reference_id?: string; custom_id?: string; payments?: { captures?: Array<{ id: string; status: string }> } }>;
};

export class PayPalProvider implements PaymentProvider {
  readonly id = "paypal";
  readonly label = "PayPal";
  readonly enabled: boolean;
  private readonly baseUrl: string;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET);
    this.baseUrl = config.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const order = await this.request<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.order.id,
            custom_id: input.order.id,
            description: input.product.name,
            amount: {
              currency_code: input.order.currency,
              value: centsToDecimal(input.order.totalCents),
              breakdown: {
                item_total: {
                  currency_code: input.order.currency,
                  value: centsToDecimal(input.order.totalCents)
                }
              }
            },
            items: [
              {
                name: input.product.name,
                quantity: String(input.order.quantity),
                unit_amount: {
                  currency_code: input.order.currency,
                  value: centsToDecimal(input.order.unitPriceCents)
                }
              }
            ]
          }
        ],
        application_context: {
          brand_name: this.config.STORE_NAME,
          return_url: `${input.publicBaseUrl}/paypal/return?orderId=${encodeURIComponent(input.order.id)}`,
          cancel_url: `${input.publicBaseUrl}/payment/cancel?orderId=${encodeURIComponent(input.order.id)}`
        }
      }
    });

    const approvalUrl = order.links?.find((link) => link.rel === "approve")?.href ?? null;
    return {
      provider: this.id,
      reference: order.id,
      url: approvalUrl
    };
  }

  async captureReturn(token: string, orderId?: string): Promise<PaymentUpdate[]> {
    const capture = await this.request<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(token)}/capture`, {
      method: "POST"
    });
    const captureStatus = capture.purchase_units?.[0]?.payments?.captures?.[0]?.status;
    return [
      {
        provider: this.id,
        eventId: `${token}:capture`,
        eventType: "paypal.return.capture",
        status: capture.status === "COMPLETED" || captureStatus === "COMPLETED" ? "paid" : "pending",
        orderId: orderId ?? capture.purchase_units?.[0]?.custom_id ?? capture.purchase_units?.[0]?.reference_id,
        reference: token,
        raw: capture
      }
    ];
  }

  async handleWebhook(input: { headers: Record<string, string | string[] | undefined>; body?: unknown }): Promise<PaymentUpdate[]> {
    const event = input.body as {
      id?: string;
      event_type?: string;
      resource?: PayPalOrder & { custom_id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
    };

    if (this.config.PAYPAL_WEBHOOK_ID) {
      const verification = await this.request<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: {
          auth_algo: getHeader(input.headers, "paypal-auth-algo"),
          cert_url: getHeader(input.headers, "paypal-cert-url"),
          transmission_id: getHeader(input.headers, "paypal-transmission-id"),
          transmission_sig: getHeader(input.headers, "paypal-transmission-sig"),
          transmission_time: getHeader(input.headers, "paypal-transmission-time"),
          webhook_id: this.config.PAYPAL_WEBHOOK_ID,
          webhook_event: event
        }
      });
      if (verification.verification_status !== "SUCCESS") {
        throw new Error("Invalid PayPal webhook signature");
      }
    }

    const resource = event.resource;
    const reference = resource?.supplementary_data?.related_ids?.order_id ?? resource?.id;
    const orderId = resource?.purchase_units?.[0]?.custom_id ?? resource?.purchase_units?.[0]?.reference_id ?? resource?.custom_id;

    const status = (() => {
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.COMPLETED") return "paid";
      if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") return "refunded";
      if (event.event_type === "CHECKOUT.ORDER.APPROVED") return "pending";
      return "pending";
    })();

    return [
      {
        provider: this.id,
        eventId: event.id ?? `${reference}:${event.event_type}`,
        eventType: event.event_type ?? "paypal.event",
        status,
        orderId,
        reference,
        raw: event
      }
    ];
  }

  private async accessToken(): Promise<string> {
    if (!this.config.PAYPAL_CLIENT_ID || !this.config.PAYPAL_CLIENT_SECRET) {
      throw new Error("PayPal is not configured");
    }
    const basic = Buffer.from(`${this.config.PAYPAL_CLIENT_ID}:${this.config.PAYPAL_CLIENT_SECRET}`).toString("base64");
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    if (!response.ok) {
      throw new Error(`PayPal token failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  private async request<T>(path: string, input: { method: string; body?: unknown }): Promise<T> {
    const token = await this.accessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: input.body ? JSON.stringify(input.body) : undefined
    });
    if (!response.ok) {
      throw new Error(`PayPal request failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}
