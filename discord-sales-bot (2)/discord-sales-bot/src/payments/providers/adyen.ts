import crypto from "node:crypto";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { fetchJson, parseWebhookBody, safeCompare, statusFromWords } from "./helpers.js";

type AdyenPaymentLinkResponse = {
  id?: string;
  url?: string;
};

type AdyenNotificationItem = {
  pspReference?: string;
  originalReference?: string;
  merchantAccountCode?: string;
  merchantReference?: string;
  amount?: { value?: number; currency?: string };
  eventCode?: string;
  success?: "true" | "false" | boolean;
  additionalData?: { hmacSignature?: string };
};

export class AdyenProvider implements PaymentProvider {
  readonly id = "adyen";
  readonly label = "Adyen";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.ADYEN_API_KEY && config.ADYEN_MERCHANT_ACCOUNT);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.ADYEN_API_KEY || !this.config.ADYEN_MERCHANT_ACCOUNT) {
      throw new Error("Adyen requires ADYEN_API_KEY and ADYEN_MERCHANT_ACCOUNT");
    }

    const response = await fetchJson<AdyenPaymentLinkResponse>(this.id, `${this.checkoutBaseUrl()}/v72/paymentLinks`, {
      method: "POST",
      headers: {
        "x-API-key": this.config.ADYEN_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: {
          value: input.order.totalCents,
          currency: input.order.currency
        },
        reference: input.order.id,
        merchantAccount: this.config.ADYEN_MERCHANT_ACCOUNT,
        returnUrl: `${input.publicBaseUrl.replace(/\/$/, "")}/payment/success?orderId=${encodeURIComponent(input.order.id)}`,
        countryCode: this.config.ADYEN_COUNTRY_CODE ?? "BR",
        shopperLocale: this.config.ADYEN_SHOPPER_LOCALE ?? "pt-BR"
      })
    });

    return {
      provider: this.id,
      reference: response.id ?? input.order.id,
      url: response.url ?? null
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    const body = parseWebhookBody<{ notificationItems?: Array<{ NotificationRequestItem?: AdyenNotificationItem }> }>(input);
    return (body.notificationItems ?? []).map((wrapper) => {
      const item = wrapper.NotificationRequestItem ?? {};
      this.verifyHmac(item);
      const success = item.success === true || item.success === "true";
      const eventCode = item.eventCode ?? "AUTHORISATION";
      const status = (() => {
        if (eventCode === "AUTHORISATION") return success ? "paid" : "failed";
        if (eventCode === "REFUND") return "refunded";
        if (eventCode === "CANCELLATION") return "expired";
        return statusFromWords(success ? "paid" : "pending");
      })();
      return {
        provider: this.id,
        eventId: item.pspReference ?? `${item.merchantReference}:${eventCode}`,
        eventType: eventCode,
        status,
        orderId: item.merchantReference,
        reference: item.pspReference,
        raw: item
      };
    });
  }

  private verifyHmac(item: AdyenNotificationItem): void {
    if (!this.config.ADYEN_HMAC_KEY) return;
    const received = item.additionalData?.hmacSignature;
    const payload = [
      item.pspReference ?? "",
      item.originalReference ?? "",
      item.merchantAccountCode ?? "",
      item.merchantReference ?? "",
      item.amount?.value ?? "",
      item.amount?.currency ?? "",
      item.eventCode ?? "",
      item.success ?? ""
    ]
      .map((value) => String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:"))
      .join(":");
    const expected = crypto.createHmac("sha256", Buffer.from(this.config.ADYEN_HMAC_KEY, "hex")).update(payload).digest("base64");
    if (!safeCompare(received, expected)) throw new Error("Invalid Adyen HMAC signature");
  }

  private checkoutBaseUrl(): string {
    if (this.config.ADYEN_CHECKOUT_BASE_URL) return this.config.ADYEN_CHECKOUT_BASE_URL.replace(/\/$/, "");
    return this.config.ADYEN_ENV === "production" ? "https://checkout-live.adyen.com" : "https://checkout-test.adyen.com";
  }
}
