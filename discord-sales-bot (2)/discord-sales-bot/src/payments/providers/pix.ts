import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { createPixPayload } from "../../utils/pix.js";

export class PixStaticProvider implements PaymentProvider {
  readonly id = "pix";
  readonly label = "Pix normal";
  readonly enabled: boolean;

  constructor(private readonly config: AppConfig) {
    this.enabled = Boolean(config.PIX_KEY && config.PIX_RECEIVER_NAME);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.config.PIX_KEY || !this.config.PIX_RECEIVER_NAME) {
      throw new Error("Pix normal requires PIX_KEY and PIX_RECEIVER_NAME");
    }

    const txid = input.order.id.replaceAll("-", "").slice(0, 25);
    const payload = createPixPayload({
      key: this.config.PIX_KEY,
      receiverName: this.config.PIX_RECEIVER_NAME,
      receiverCity: this.config.PIX_CITY,
      amount: centsToDecimal(input.order.totalCents),
      txid,
      description: this.config.PIX_DESCRIPTION
    });

    return {
      provider: this.id,
      reference: txid,
      url: null,
      instructions: [
        `Pedido ${input.order.id}`,
        `Valor: ${input.order.currency} ${centsToDecimal(input.order.totalCents)}`,
        "Pix copia e cola:",
        payload,
        "",
        "Depois de pagar, use /comprovante com o ID do pedido e anexe o comprovante."
      ].join("\n")
    };
  }
}
