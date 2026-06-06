import type { BaseMessageOptions, Client } from "discord.js";
import type { AppConfig } from "../config.js";
import type { Order } from "../domain.js";
import { manualReviewButtons } from "../discord/renderers.js";
import { formatMoney } from "../utils/money.js";

export class NotificationService {
  constructor(
    private readonly client: Client,
    private readonly config: AppConfig
  ) {}

  async log(content: string): Promise<void> {
    if (!this.config.DISCORD_LOG_CHANNEL_ID) return;
    const channel = await this.client.channels.fetch(this.config.DISCORD_LOG_CHANNEL_ID).catch(() => null);
    if (canSend(channel)) {
      await channel.send(content).catch(() => undefined);
    }
  }

  async dm(userId: string, content: string): Promise<boolean> {
    const user = await this.client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    await user.send(content).catch(() => undefined);
    return true;
  }

  async orderCreated(order: Order): Promise<void> {
    await this.log(
      `Novo pedido ${order.id} - ${order.discordUsername} - ${order.productName} x${order.quantity} - ${formatMoney(
        order.totalCents,
        order.currency
      )} via ${order.paymentProvider ?? "sem provedor"}`
    );
  }

  async paymentReceived(order: Order): Promise<void> {
    await this.log(`Pagamento aprovado para pedido ${order.id} (${order.productName})`);
  }

  async fulfilled(order: Order): Promise<void> {
    await this.log(`Pedido entregue ${order.id} para <@${order.discordUserId}>`);
  }

  async manualProof(order: Order, attachmentUrl: string): Promise<void> {
    if (!this.config.DISCORD_LOG_CHANNEL_ID) return;
    const channel = await this.client.channels.fetch(this.config.DISCORD_LOG_CHANNEL_ID).catch(() => null);
    if (canSend(channel)) {
      await channel
        .send({
          content: [
            `Comprovante recebido para pedido ${order.id}`,
            `Cliente: <@${order.discordUserId}>`,
            `Produto: ${order.productName}`,
            `Valor: ${formatMoney(order.totalCents, order.currency)}`,
            attachmentUrl
          ].join("\n"),
          components: manualReviewButtons(order.id)
        })
        .catch(() => undefined);
    }
  }
}

type SendableChannel = {
  send(content: string | BaseMessageOptions): Promise<unknown>;
};

function canSend(channel: unknown): channel is SendableChannel {
  return typeof (channel as { send?: unknown } | null)?.send === "function";
}
