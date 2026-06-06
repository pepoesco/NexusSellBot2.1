import { StoreDb } from "../db.js";
import { NotificationService } from "../services/notifications.js";

export function startOrderExpirationJob(db: StoreDb, notifications: NotificationService): NodeJS.Timeout {
  return setInterval(() => {
    const expired = db.listExpiredReservableOrders();
    for (const order of expired) {
      const updated = db.cancelAndReleaseOrder(order.id, "expired");
      void notifications.log(`Pedido expirado: ${updated.id}`);
    }
  }, 60_000);
}
