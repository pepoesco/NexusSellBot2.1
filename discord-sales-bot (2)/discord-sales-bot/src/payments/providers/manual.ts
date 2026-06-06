import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";

export class ManualPaymentProvider implements PaymentProvider {
  readonly id = "manual";
  readonly label = "Pix/manual";
  readonly enabled = true;

  constructor(private readonly config: AppConfig) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const pixLine = this.config.PIX_KEY ? `Pix: ${this.config.PIX_KEY}` : "Pix nao configurado.";
    const receiver = this.config.PIX_RECEIVER_NAME ? `Recebedor: ${this.config.PIX_RECEIVER_NAME}` : "";
    const bank = this.config.MANUAL_BANK_INSTRUCTIONS ?? "";
    const instructions = [
      `Pedido ${input.order.id}`,
      `Valor: ${input.order.currency} ${centsToDecimal(input.order.totalCents)}`,
      pixLine,
      receiver,
      bank,
      "Depois de pagar, use /comprovante com o ID do pedido e anexe o comprovante."
    ]
      .filter(Boolean)
      .join("\n");

    return {
      provider: this.id,
      reference: input.order.id,
      url: null,
      instructions
    };
  }
}
