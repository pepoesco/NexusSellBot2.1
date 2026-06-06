import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { getHeader } from "../headers.js";
import { fetchJson, parseWebhookBody, publicUrl, statusFromWords } from "./helpers.js";

type AsaasPaymentResponse = {
  id?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  status?: string;
};

type AsaasPixResponse = {
  payload?: string;
  encodedImage?: string;
  expirationDate?: string;
};

export class AsaasProvider implements PaymentProvider {
  readonly id = "asaas";
  readonly label = "Asaas";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.ASAAS_API_KEY && config.ASAAS_CUSTOMER_ID);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.ASAAS_API_KEY || !this.config.ASAAS_CUSTOMER_ID) {
      throw new Error("Asaas requires ASAAS_API_KEY and ASAAS_CUSTOMER_ID");
    }

    const billingType = this.config.ASAAS_BILLING_TYPE ?? "PIX";
    const payment = await fetchJson<AsaasPaymentResponse>(this.id, `${this.baseUrl()}/payments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        customer: this.config.ASAAS_CUSTOMER_ID,
        billingType,
        value: Number(centsToDecimal(input.order.totalCents)),
        dueDate: input.order.expiresAt.slice(0, 10),
        description: `${input.product.name} x${input.order.quantity}`,
        externalReference: input.order.id,
        callback: {
          successUrl: publicUrl(input.publicBaseUrl, `/payment/success?orderId=${encodeURIComponent(input.order.id)}`),
          autoRedirect: true
        }
      })
    });

    let instructions: string | null = null;
    if (billingType.toUpperCase() === "PIX" && payment.id) {
      const pix = await fetchJson<AsaasPixResponse>(this.id, `${this.baseUrl()}/payments/${payment.id}/pixQrCode`, {
        method: "GET",
        headers: this.headers()
      });
      instructions = ["Pix Asaas copia e cola:", pix.payload, pix.expirationDate ? `Expira em: ${pix.expirationDate}` : null]
        .filter(Boolean)
        .join("\n");
    }

    return {
      provider: this.id,
      reference: payment.id ?? input.order.id,
      url: payment.invoiceUrl ?? payment.bankSlipUrl ?? null,
      instructions
    };
  }

  async handleWebhook(input: Parameters<NonNullable<PaymentProvider["handleWebhook"]>>[0]): Promise<PaymentUpdate[]> {
    if (this.config.ASAAS_WEBHOOK_TOKEN) {
      const token = getHeader(input.headers, "asaas-access-token");
      if (token !== this.config.ASAAS_WEBHOOK_TOKEN) throw new Error("Invalid Asaas webhook token");
    }

    const body = parseWebhookBody<{
      event?: string;
      payment?: { id?: string; externalReference?: string; status?: string };
    }>(input);
    const payment = body.payment ?? {};
    if (!payment.id && !payment.externalReference) return [];

    return [
      {
        provider: this.id,
        eventId: `${body.event ?? "asaas.payment"}:${payment.id ?? payment.externalReference}`,
        eventType: body.event ?? "asaas.payment",
        status: statusFromWords(body.event?.includes("RECEIVED") ? "paid" : payment.status),
        orderId: payment.externalReference,
        reference: payment.id,
        raw: body
      }
    ];
  }

  private baseUrl(): string {
    return this.config.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
  }

  private headers(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      access_token: this.config.ASAAS_API_KEY ?? ""
    };
  }
}
