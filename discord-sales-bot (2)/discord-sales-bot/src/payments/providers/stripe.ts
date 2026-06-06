import Stripe from "stripe";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { getHeader } from "../headers.js";

export class StripeProvider implements PaymentProvider {
  readonly id = "stripe";
  readonly label = "Stripe";
  readonly enabled: boolean;
  private readonly stripe: Stripe | null;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.STRIPE_SECRET_KEY);
    this.stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.stripe) {
      throw new Error("Stripe is not configured");
    }

    const paymentMethods = this.config.STRIPE_PAYMENT_METHODS?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[] | undefined;

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.order.id,
      payment_method_types: paymentMethods,
      line_items: [
        {
          quantity: input.order.quantity,
          price_data: {
            currency: input.order.currency.toLowerCase(),
            unit_amount: input.order.unitPriceCents,
            product_data: {
              name: input.product.name,
              description: input.product.description || undefined
            }
          }
        }
      ],
      metadata: {
        orderId: input.order.id,
        discordUserId: input.order.discordUserId
      },
      success_url: `${input.publicBaseUrl}/payment/success?orderId=${encodeURIComponent(input.order.id)}`,
      cancel_url: `${input.publicBaseUrl}/payment/cancel?orderId=${encodeURIComponent(input.order.id)}`
    });

    return {
      provider: this.id,
      reference: session.id,
      url: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
    };
  }

  async handleWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody?: Buffer }): Promise<PaymentUpdate[]> {
    if (!this.stripe || !this.config.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhook secret is not configured");
    }

    const signature = getHeader(input.headers, "stripe-signature");
    if (!signature || !input.rawBody) {
      throw new Error("Missing Stripe webhook signature or body");
    }

    const event = this.stripe.webhooks.constructEvent(input.rawBody, signature, this.config.STRIPE_WEBHOOK_SECRET);
    const object = event.data.object as Stripe.Checkout.Session;
    const orderId = object.metadata?.orderId ?? object.client_reference_id ?? undefined;

    const status = (() => {
      if (event.type === "checkout.session.completed" && object.payment_status === "paid") return "paid";
      if (event.type === "checkout.session.async_payment_succeeded") return "paid";
      if (event.type === "checkout.session.expired") return "expired";
      if (event.type === "checkout.session.async_payment_failed") return "failed";
      return "pending";
    })();

    return [
      {
        provider: this.id,
        eventId: event.id,
        eventType: event.type,
        status,
        orderId,
        reference: object.id,
        raw: event
      }
    ];
  }
}
