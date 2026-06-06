import type { User } from "discord.js";
import type { PaymentUpdate } from "../domain.js";
import { StoreDb } from "../db.js";
import type { PaymentRegistry } from "../payments/registry.js";
import type { AppConfig } from "../config.js";
import { FulfillmentService } from "./fulfillment.js";
import { NotificationService } from "./notifications.js";

export class OrderService {
  constructor(
    private readonly db: StoreDb,
    private readonly registry: PaymentRegistry,
    private readonly config: AppConfig,
    private readonly fulfillment: FulfillmentService,
    private readonly notifications: NotificationService
  ) {}

  async createCheckout(input: { user: User; sku: string; quantity: number; providerId?: string }) {
    const provider = input.providerId ? this.registry.get(input.providerId) : this.registry.defaultProvider();
    const expiresAt = new Date(Date.now() + this.config.ORDER_EXPIRATION_MINUTES * 60_000).toISOString();
    const { order, product } = this.db.createReservedOrder({
      discordUserId: input.user.id,
      discordUsername: input.user.tag,
      productSku: input.sku,
      quantity: input.quantity,
      expiresAt
    });

    try {
      const checkout = await provider.createCheckout({
        order,
        product,
        publicBaseUrl: this.config.PUBLIC_BASE_URL
      });
      const attached = this.db.attachCheckout(order.id, checkout.provider, checkout.reference, checkout.url, checkout.instructions);
      await this.notifications.orderCreated(attached);
      return { order: attached, product, checkout, provider };
    } catch (error) {
      this.db.cancelAndReleaseOrder(order.id, "payment_failed");
      throw error;
    }
  }

  async applyPaymentUpdates(updates: PaymentUpdate[]): Promise<void> {
    for (const update of updates) {
      const inserted = this.db.insertPaymentEvent({
        provider: update.provider,
        externalId: update.eventId,
        eventType: update.eventType,
        orderId: update.orderId,
        raw: update.raw
      });
      if (!inserted) continue;

      const order =
        (update.orderId ? this.db.getOrderById(update.orderId) : null) ??
        (update.reference ? this.db.findOrderByPayment(update.provider, update.reference) : null);
      if (!order) {
        await this.notifications.log(`Webhook sem pedido correspondente: ${update.provider} ${update.eventId}`);
        continue;
      }

      if (update.status === "paid") {
        if (order.status !== "paid" && order.status !== "fulfilled") {
          const paid = this.db.updateOrderStatus(order.id, "paid", { paidAt: new Date().toISOString() });
          await this.notifications.paymentReceived(paid);
          await this.fulfillment.fulfill(paid).catch(async (error: unknown) => {
            await this.notifications.log(`Falha ao entregar pedido ${paid.id}: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
        continue;
      }

      if (update.status === "manual_review") {
        this.db.updateOrderStatus(order.id, "manual_review");
        continue;
      }

      if (update.status === "failed") {
        this.db.cancelAndReleaseOrder(order.id, "payment_failed");
        continue;
      }

      if (update.status === "expired") {
        this.db.cancelAndReleaseOrder(order.id, "expired");
        continue;
      }

      if (update.status === "refunded") {
        this.db.updateOrderStatus(order.id, "refunded");
      }
    }
  }

  async submitManualProof(orderId: string, user: User, attachmentUrl: string): Promise<void> {
    const order = this.db.getOrderById(orderId);
    if (!order) throw new Error("Pedido nao encontrado");
    if (order.discordUserId !== user.id) throw new Error("Esse pedido nao pertence a voce");
    if (order.status !== "pending_payment" && order.status !== "manual_review") {
      throw new Error(`Pedido nao aceita comprovante no status ${order.status}`);
    }
    const reviewed = this.db.updateOrderStatus(order.id, "manual_review");
    await this.notifications.manualProof(reviewed, attachmentUrl);
  }

  async approveManualOrder(orderId: string, actorId: string): Promise<void> {
    const order = this.db.getOrderById(orderId);
    if (!order) throw new Error("Pedido nao encontrado");
    this.db.insertAudit(actorId, "manual_order_approved", orderId, { previousStatus: order.status });
    const paid = this.db.updateOrderStatus(order.id, "paid", { paidAt: new Date().toISOString() });
    await this.notifications.paymentReceived(paid);
    await this.fulfillment.fulfill(paid);
  }

  async rejectManualOrder(orderId: string, actorId: string): Promise<void> {
    const order = this.db.cancelAndReleaseOrder(orderId, "payment_failed");
    this.db.insertAudit(actorId, "manual_order_rejected", orderId, { status: order.status });
    await this.notifications.log(`Pedido manual rejeitado: ${orderId}`);
  }
}
