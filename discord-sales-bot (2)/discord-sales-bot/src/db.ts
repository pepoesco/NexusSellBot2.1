import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { Order, OrderStatus, Product } from "./domain.js";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  currency: string;
  stock: number;
  role_id: string | null;
  delivery_text: string | null;
  image_url: string | null;
  active: 0 | 1;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: string;
  discord_user_id: string;
  discord_username: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  currency: string;
  status: OrderStatus;
  payment_provider: string | null;
  payment_reference: string | null;
  checkout_url: string | null;
  instructions: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  metadata_json: string;
};

export type UpsertProductInput = {
  sku: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  currency: string;
  stock: number;
  roleId?: string | null;
  deliveryText?: string | null;
  imageUrl?: string | null;
};

export type CreateReservedOrderInput = {
  discordUserId: string;
  discordUsername: string;
  productSku: string;
  quantity: number;
  expiresAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    priceCents: row.price_cents,
    currency: row.currency,
    stock: row.stock,
    roleId: row.role_id,
    deliveryText: row.delivery_text,
    imageUrl: row.image_url,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    productId: row.product_id,
    productSku: row.product_sku,
    productName: row.product_name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    status: row.status,
    paymentProvider: row.payment_provider,
    paymentReference: row.payment_reference,
    checkoutUrl: row.checkout_url,
    instructions: row.instructions,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
    metadata: JSON.parse(row.metadata_json || "{}") as Record<string, unknown>
  };
}

export class StoreDb {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  listProducts(category?: string): Product[] {
    const rows = category
      ? this.db
          .prepare("SELECT * FROM products WHERE active = 1 AND category = ? ORDER BY category, name")
          .all(category)
      : this.db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY category, name").all();
    return (rows as ProductRow[]).map(mapProduct);
  }

  listAllProducts(): Product[] {
    const rows = this.db.prepare("SELECT * FROM products ORDER BY active DESC, category, name").all() as ProductRow[];
    return rows.map(mapProduct);
  }

  listLowStockProducts(limit = 10): Product[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM products
         WHERE active = 1
           AND stock >= 0
         ORDER BY stock ASC, name ASC
         LIMIT ?`
      )
      .all(limit) as ProductRow[];
    return rows.map(mapProduct);
  }

  getProductCount(): { active: number; inactive: number; totalStock: number } {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inactive,
           SUM(CASE WHEN active = 1 AND stock > 0 THEN stock ELSE 0 END) AS totalStock
         FROM products`
      )
      .get() as { active: number | null; inactive: number | null; totalStock: number | null };
    return {
      active: row.active ?? 0,
      inactive: row.inactive ?? 0,
      totalStock: row.totalStock ?? 0
    };
  }

  listCategories(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category")
      .all() as Array<{ category: string }>;
    return rows.map((row) => row.category);
  }

  getProductBySku(sku: string): Product | null {
    const row = this.db.prepare("SELECT * FROM products WHERE sku = ?").get(sku) as ProductRow | undefined;
    return row ? mapProduct(row) : null;
  }

  getProductById(id: string): Product | null {
    const row = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
    return row ? mapProduct(row) : null;
  }

  upsertProduct(input: UpsertProductInput): Product {
    const existing = this.getProductBySku(input.sku);
    const timestamp = nowIso();
    const id = existing?.id ?? randomUUID();

    this.db
      .prepare(
        `INSERT INTO products (
          id, sku, name, description, category, price_cents, currency, stock,
          role_id, delivery_text, image_url, active, created_at, updated_at
        ) VALUES (
          @id, @sku, @name, @description, @category, @priceCents, @currency, @stock,
          @roleId, @deliveryText, @imageUrl, 1, @createdAt, @updatedAt
        )
        ON CONFLICT(sku) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          category = excluded.category,
          price_cents = excluded.price_cents,
          currency = excluded.currency,
          stock = excluded.stock,
          role_id = excluded.role_id,
          delivery_text = excluded.delivery_text,
          image_url = excluded.image_url,
          active = 1,
          updated_at = excluded.updated_at`
      )
      .run({
        id,
        sku: input.sku,
        name: input.name,
        description: input.description,
        category: input.category,
        priceCents: input.priceCents,
        currency: input.currency,
        stock: input.stock,
        roleId: input.roleId ?? null,
        deliveryText: input.deliveryText ?? null,
        imageUrl: input.imageUrl ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      });

    const product = this.getProductBySku(input.sku);
    if (!product) {
      throw new Error("Product upsert failed");
    }
    return product;
  }

  setProductStock(sku: string, stock: number): Product {
    this.db.prepare("UPDATE products SET stock = ?, updated_at = ? WHERE sku = ?").run(stock, nowIso(), sku);
    const product = this.getProductBySku(sku);
    if (!product) {
      throw new Error(`Product not found: ${sku}`);
    }
    return product;
  }

  deactivateProduct(sku: string): void {
    this.db.prepare("UPDATE products SET active = 0, updated_at = ? WHERE sku = ?").run(nowIso(), sku);
  }

  createReservedOrder(input: CreateReservedOrderInput): { order: Order; product: Product } {
    const tx = this.db.transaction(() => {
      const product = this.getProductBySku(input.productSku);
      if (!product || !product.active) {
        throw new Error(`Product unavailable: ${input.productSku}`);
      }
      if (input.quantity <= 0) {
        throw new Error("Quantity must be positive");
      }
      if (product.stock >= 0 && product.stock < input.quantity) {
        throw new Error(`Insufficient stock for ${product.sku}`);
      }
      if (product.stock >= 0) {
        this.db.prepare("UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?").run(input.quantity, nowIso(), product.id);
      }

      const orderId = randomUUID();
      const timestamp = nowIso();
      this.db
        .prepare(
          `INSERT INTO orders (
            id, discord_user_id, discord_username, product_id, product_sku, product_name,
            quantity, unit_price_cents, total_cents, currency, status, created_at, expires_at, metadata_json
          ) VALUES (
            @id, @discordUserId, @discordUsername, @productId, @productSku, @productName,
            @quantity, @unitPriceCents, @totalCents, @currency, 'created', @createdAt, @expiresAt, '{}'
          )`
        )
        .run({
          id: orderId,
          discordUserId: input.discordUserId,
          discordUsername: input.discordUsername,
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          quantity: input.quantity,
          unitPriceCents: product.priceCents,
          totalCents: product.priceCents * input.quantity,
          currency: product.currency,
          createdAt: timestamp,
          expiresAt: input.expiresAt
        });

      const order = this.getOrderById(orderId);
      if (!order) {
        throw new Error("Order creation failed");
      }
      return { order, product };
    });

    return tx();
  }

  attachCheckout(orderId: string, provider: string, reference: string, checkoutUrl: string | null, instructions?: string | null): Order {
    this.db
      .prepare(
        `UPDATE orders
         SET status = 'pending_payment',
             payment_provider = ?,
             payment_reference = ?,
             checkout_url = ?,
             instructions = ?
         WHERE id = ?`
      )
      .run(provider, reference, checkoutUrl, instructions ?? null, orderId);
    const order = this.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    return order;
  }

  getOrderById(id: string): Order | null {
    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
    return row ? mapOrder(row) : null;
  }

  findOrderByPayment(provider: string, reference: string): Order | null {
    const row = this.db
      .prepare("SELECT * FROM orders WHERE payment_provider = ? AND payment_reference = ?")
      .get(provider, reference) as OrderRow | undefined;
    return row ? mapOrder(row) : null;
  }

  listRecentOrders(limit = 10): Order[] {
    const rows = this.db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").all(limit) as OrderRow[];
    return rows.map(mapOrder);
  }

  listExpiredReservableOrders(atIso = nowIso()): Order[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM orders
         WHERE status IN ('created', 'pending_payment')
           AND expires_at <= ?
         ORDER BY expires_at ASC`
      )
      .all(atIso) as OrderRow[];
    return rows.map(mapOrder);
  }

  updateOrderStatus(id: string, status: OrderStatus, patch: Partial<Pick<Order, "paidAt" | "fulfilledAt">> = {}): Order {
    this.db
      .prepare(
        `UPDATE orders
         SET status = @status,
             paid_at = COALESCE(@paidAt, paid_at),
             fulfilled_at = COALESCE(@fulfilledAt, fulfilled_at)
         WHERE id = @id`
      )
      .run({
        id,
        status,
        paidAt: patch.paidAt ?? null,
        fulfilledAt: patch.fulfilledAt ?? null
      });
    const order = this.getOrderById(id);
    if (!order) {
      throw new Error(`Order not found: ${id}`);
    }
    return order;
  }

  cancelAndReleaseOrder(id: string, status: Extract<OrderStatus, "canceled" | "expired" | "payment_failed">): Order {
    const tx = this.db.transaction(() => {
      const order = this.getOrderById(id);
      if (!order) {
        throw new Error(`Order not found: ${id}`);
      }
      if (["paid", "fulfilled", "refunded"].includes(order.status)) {
        return order;
      }
      const product = this.getProductById(order.productId);
      if (product && product.stock >= 0) {
        this.db.prepare("UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?").run(order.quantity, nowIso(), product.id);
      }
      return this.updateOrderStatus(id, status);
    });
    return tx();
  }

  insertPaymentEvent(input: {
    provider: string;
    externalId: string;
    eventType: string;
    orderId?: string | null;
    raw: unknown;
  }): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO payment_events (provider, external_id, event_type, order_id, raw_json, received_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.provider, input.externalId, input.eventType, input.orderId ?? null, JSON.stringify(input.raw), nowIso());
    return result.changes > 0;
  }

  insertAudit(actorId: string, action: string, targetId: string, detail: unknown): void {
    this.db
      .prepare("INSERT INTO audit_logs (actor_id, action, target_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(actorId, action, targetId, JSON.stringify(detail), nowIso());
  }

  getSalesSummary(): {
    totalOrders: number;
    paidOrders: number;
    fulfilledOrders: number;
    grossRevenueCents: number;
    pendingOrders: number;
    manualReviewOrders: number;
  } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS totalOrders,
           SUM(CASE WHEN status IN ('paid', 'fulfilled') THEN 1 ELSE 0 END) AS paidOrders,
           SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) AS fulfilledOrders,
           SUM(CASE WHEN status IN ('created', 'pending_payment') THEN 1 ELSE 0 END) AS pendingOrders,
           SUM(CASE WHEN status = 'manual_review' THEN 1 ELSE 0 END) AS manualReviewOrders,
           SUM(CASE WHEN status IN ('paid', 'fulfilled') THEN total_cents ELSE 0 END) AS grossRevenueCents
         FROM orders`
      )
      .get() as {
      totalOrders: number;
      paidOrders: number | null;
      fulfilledOrders: number | null;
      pendingOrders: number | null;
      manualReviewOrders: number | null;
      grossRevenueCents: number | null;
    };
    return {
      totalOrders: row.totalOrders,
      paidOrders: row.paidOrders ?? 0,
      fulfilledOrders: row.fulfilledOrders ?? 0,
      grossRevenueCents: row.grossRevenueCents ?? 0,
      pendingOrders: row.pendingOrders ?? 0,
      manualReviewOrders: row.manualReviewOrders ?? 0
    };
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'geral',
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'BRL',
        stock INTEGER NOT NULL DEFAULT -1,
        role_id TEXT,
        delivery_text TEXT,
        image_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        discord_user_id TEXT NOT NULL,
        discord_username TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_sku TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        payment_provider TEXT,
        payment_reference TEXT,
        checkout_url TEXT,
        instructions TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        paid_at TEXT,
        fulfilled_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(product_id) REFERENCES products(id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(discord_user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_provider, payment_reference);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      CREATE TABLE IF NOT EXISTS payment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        order_id TEXT,
        raw_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        UNIQUE(provider, external_id, event_type)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
}
