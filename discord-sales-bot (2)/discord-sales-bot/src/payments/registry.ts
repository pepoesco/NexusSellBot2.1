import type { AppConfig } from "../config.js";
import type { PaymentProvider } from "../domain.js";
import { AdyenProvider } from "./providers/adyen.js";
import { AsaasProvider } from "./providers/asaas.js";
import { CieloProvider } from "./providers/cielo.js";
import { CustomWebhookProvider } from "./providers/custom-webhook.js";
import { EfiBankProvider } from "./providers/efibank.js";
import { ItauProvider } from "./providers/itau.js";
import { ManualPaymentProvider } from "./providers/manual.js";
import { MercadoPagoProvider } from "./providers/mercadopago.js";
import { MollieProvider } from "./providers/mollie.js";
import { PagarmeProvider } from "./providers/pagarme.js";
import { PagSeguroProvider } from "./providers/pagseguro.js";
import { PayPalProvider } from "./providers/paypal.js";
import { PixStaticProvider } from "./providers/pix.js";
import { RazorpayProvider } from "./providers/razorpay.js";
import { SquareProvider } from "./providers/square.js";
import { StripeProvider } from "./providers/stripe.js";

export class PaymentRegistry {
  private readonly providers: PaymentProvider[];

  constructor(config: AppConfig) {
    this.providers = [
      new StripeProvider(config),
      new MercadoPagoProvider(config),
      new PagarmeProvider(config),
      new AsaasProvider(config),
      new EfiBankProvider(config),
      new ItauProvider(config),
      new PagSeguroProvider(config),
      new CieloProvider(config),
      new PixStaticProvider(config),
      new PayPalProvider(config),
      new AdyenProvider(config),
      new SquareProvider(config),
      new MollieProvider(config),
      new RazorpayProvider(config),
      new CustomWebhookProvider(config),
      new ManualPaymentProvider(config)
    ];
  }

  enabled(): PaymentProvider[] {
    return this.providers.filter((provider) => provider.enabled);
  }

  all(): PaymentProvider[] {
    return [...this.providers];
  }

  get(id: string): PaymentProvider {
    const provider = this.providers.find((item) => item.id === id);
    if (!provider || !provider.enabled) {
      throw new Error(`Payment provider unavailable: ${id}`);
    }
    return provider;
  }

  defaultProvider(): PaymentProvider {
    const first = this.enabled()[0];
    if (!first) {
      throw new Error("No payment providers are enabled");
    }
    return first;
  }
}
