import { createRequire } from "node:module";
import type { AppConfig } from "../../config.js";
import type { CheckoutInput, CheckoutSession, PaymentProvider, PaymentUpdate } from "../../domain.js";
import { centsToDecimal } from "../../utils/money.js";
import { getHeader } from "../headers.js";

const require = createRequire(import.meta.url);

type EfiPayClient = {
  pixCreateCharge(params: { txid: string }, body: unknown): Promise<unknown>;
  pixGenerateQRCode(params: { id: number | string }): Promise<unknown>;
};

const EfiPayCtor = require("sdk-node-apis-efi") as new (options: {
  sandbox: boolean;
  client_id: string;
  client_secret: string;
  certificate?: string;
  cert_base64?: boolean;
}) => EfiPayClient;

type EfiCobResponse = {
  txid?: string;
  loc?: { id?: number | string };
  pixCopiaECola?: string;
  location?: string;
  status?: string;
};

type EfiQrResponse = {
  qrcode?: string;
  imagemQrcode?: string;
};

export class EfiBankProvider implements PaymentProvider {
  readonly id = "efibank";
  readonly label = "Efibank Pix";
  readonly enabled: boolean;
  private readonly client: EfiPayClient | null;

  constructor(private readonly config: AppConfig) {
    const hasCertificate = Boolean(config.EFIBANK_CERTIFICATE_BASE64 || config.EFIBANK_CERTIFICATE_PATH);
    this.enabled = Boolean(config.EFIBANK_CLIENT_ID && config.EFIBANK_CLIENT_SECRET && config.EFIBANK_PIX_KEY && hasCertificate);
    this.client = this.enabled
      ? new EfiPayCtor({
          sandbox: config.EFIBANK_SANDBOX,
          client_id: config.EFIBANK_CLIENT_ID!,
          client_secret: config.EFIBANK_CLIENT_SECRET!,
          certificate: config.EFIBANK_CERTIFICATE_BASE64 ?? config.EFIBANK_CERTIFICATE_PATH,
          cert_base64: Boolean(config.EFIBANK_CERTIFICATE_BASE64)
        })
      : null;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.client || !this.config.EFIBANK_PIX_KEY) {
      throw new Error("Efibank is not configured");
    }

    const txid = input.order.id.replaceAll("-", "").slice(0, 35);
    const body = {
      calendario: {
        expiracao: Math.max(60, Math.floor((new Date(input.order.expiresAt).getTime() - Date.now()) / 1000))
      },
      valor: {
        original: centsToDecimal(input.order.totalCents)
      },
      chave: this.config.EFIBANK_PIX_KEY,
      solicitacaoPagador: `Pedido ${input.order.id}`,
      infoAdicionais: [
        { nome: "Pedido", valor: input.order.id },
        { nome: "Discord", valor: input.order.discordUserId }
      ]
    };

    const cob = (await this.client.pixCreateCharge({ txid }, body)) as EfiCobResponse;
    const locId = cob.loc?.id;
    const qr = locId ? ((await this.client.pixGenerateQRCode({ id: locId })) as EfiQrResponse) : undefined;
    const copyPaste = qr?.qrcode ?? cob.pixCopiaECola ?? null;
    const instructions = [
      "Pague com Pix pela Efibank.",
      copyPaste ? `Pix copia e cola:\n${copyPaste}` : null,
      qr?.imagemQrcode ? `QR Code imagem: ${qr.imagemQrcode}` : null
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      provider: this.id,
      reference: cob.txid ?? txid,
      url: null,
      instructions
    };
  }

  async handleWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, unknown>;
  }): Promise<PaymentUpdate[]> {
    if (this.config.EFIBANK_WEBHOOK_SECRET) {
      const provided = getHeader(input.headers, "x-nexus-webhook-secret") ?? String(input.query?.secret ?? "");
      if (provided !== this.config.EFIBANK_WEBHOOK_SECRET) {
        throw new Error("Invalid Efibank webhook secret");
      }
    }

    const body = input.body as { pix?: Array<{ endToEndId?: string; txid?: string; valor?: string; horario?: string }> };
    return (body.pix ?? [])
      .filter((pix) => Boolean(pix.txid))
      .map((pix) => ({
        provider: this.id,
        eventId: pix.endToEndId ?? `${pix.txid}:${pix.horario ?? "paid"}`,
        eventType: "pix.received",
        status: "paid",
        reference: pix.txid,
        raw: pix
      }));
  }
}
