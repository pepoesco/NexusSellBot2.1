import type { Client } from "discord.js";
import type { AppConfig } from "../config.js";
import type { Order } from "../domain.js";
import { StoreDb } from "../db.js";
import { NotificationService } from "./notifications.js";

export class FulfillmentService {
  constructor(
    private readonly db: StoreDb,
    private readonly client: Client,
    private readonly config: AppConfig,
    private readonly notifications: NotificationService
  ) {}

  async fulfill(order: Order): Promise<Order> {
    if (order.status === "fulfilled") {
      return order;
    }

    const product = this.db.getProductById(order.productId);
    if (!product) {
      throw new Error(`Product not found for order ${order.id}`);
    }

    if (product.roleId) {
      if (!this.config.DISCORD_GUILD_ID) {
        throw new Error("DISCORD_GUILD_ID is required to assign product roles");
      }
      const guild = await this.client.guilds.fetch(this.config.DISCORD_GUILD_ID);
      const member = await guild.members.fetch(order.discordUserId);
      await member.roles.add(product.roleId, `NexusSellBot order ${order.id}`);
    }

    const delivery = [
      `Seu pedido ${order.id} foi aprovado.`,
      `Produto: ${order.productName}`,
      product.roleId ? "Seu cargo/acesso foi liberado no servidor." : null,
      product.deliveryText
    ]
      .filter(Boolean)
      .join("\n\n");
    await this.notifications.dm(order.discordUserId, delivery);

    const fulfilled = this.db.updateOrderStatus(order.id, "fulfilled", { fulfilledAt: new Date().toISOString() });
    await this.notifications.fulfilled(fulfilled);
    return fulfilled;
  }
}
