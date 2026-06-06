import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { fetchJson, parseWebhookBody, statusFromWords, verifySharedSecret } from "./helpers.js";

type CieloSaleResponse = {
  MerchantOrderId?: string;
  Payment?: {
    PaymentId?: string;
    Url?: string;
    QrCodeString?: string;
    QrCodeBase64Image?: string;
    Status?: number | string;
  };
};

export class CieloProvider implements PaymentProvider {
  readonly id = "cielo";
  readonly label = "Cielo Pix";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.CIELO_MERCHANT_ID && config.CIELO_MERCHANT_KEY);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.CIELO_MERCHANT_ID || !this.config.CIELO_MERCHANT_KEY) {
      throw new Error("Cielo requires CIELO_MERCHANT_ID and CIELO_MERCHANT_KEY");
    }

    const response = await fetchJson<CieloSaleResponse>(this.id, `${this.baseUrl()}/1/sales`, {
      method: "POST",
      headers: {
        MerchantId: this.config.CIELO_MERCHANT_ID,
        MerchantKey: this.config.CIELO_MERCHANT_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        MerchantOrderId: input.order.id,
        Customer: {
          Name: input.order.discordUsername.slice(0, 255)
        },
        Payment: {
          Type: this.config.CIELO_PAYMENT_TYPE ?? "Pix",
          Amount: input.order.totalCents,
          Provider: "Cielo",
          QrCodeExpiration: Math.max(300, Math.floor((new Date(input.order.expiresAt).getTime() - Date.now()) / 1000))
        }
      })
    });

    return {
      provider: this.id,
      reference: response.Payment?.PaymentId ?? response.MerchantOrderId ?? input.order.id,
      url: response.Payment?.Url ?? null,
      instructions: response.Payment?.QrCodeString ? `Pix Cielo copia e cola:\n${response.Payment.QrCodeString}` : null
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    verifySharedSecret(input, this.config.CIELO_WEBHOOK_SECRET);
    const body = parseWebhookBody<{
      MerchantOrderId?: string;
      PaymentId?: string;
      Status?: string | number;
      Payment?: { PaymentId?: string; Status?: string | number };
    }>(input);
    const statusValue = body.Payment?.Status ?? body.Status;
    const status = (() => {
      const code = Number(statusValue);
      if ([1, 2].includes(code)) return "paid";
      if ([10, 13].includes(code)) return "expired";
      if ([11].includes(code)) return "refunded";
      if ([3].includes(code)) return "failed";
      return statusFromWords(statusValue);
    })();
    return [
      {
        provider: this.id,
        eventId: `${body.Payment?.PaymentId ?? body.PaymentId ?? body.MerchantOrderId}:${statusValue ?? "updated"}`,
        eventType: "cielo.payment.updated",
        status,
        orderId: body.MerchantOrderId,
        reference: body.Payment?.PaymentId ?? body.PaymentId,
        raw: body
      }
    ];
  }

  private baseUrl(): string {
    return this.config.CIELO_ENV === "production"
      ? "https://api.cieloecommerce.cielo.com.br"
      : "https://apisandbox.cieloecommerce.cielo.com.br";
  }
}
