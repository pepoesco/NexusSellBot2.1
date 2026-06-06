import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { StoreDb } from "../db.js";
import { PaymentRegistry } from "../payments/registry.js";
import { OrderService } from "../services/orders.js";

type PanelDeps = {
  config: AppConfig;
  db: StoreDb;
  registry: PaymentRegistry;
  orders: OrderService;
};

const cookieName = "nexus_panel";
const sessionDurationMs = 8 * 60 * 60 * 1000;

const productInput = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().min(1).max(80).default("geral"),
  priceCents: z.coerce.number().int().min(0),
  currency: z.string().trim().length(3).default("BRL"),
  stock: z.coerce.number().int().min(-1),
  roleId: z.string().trim().max(80).optional().nullable(),
  deliveryText: z.string().trim().max(2000).optional().nullable(),
  imageUrl: z.string().trim().url().optional().or(z.literal("")).nullable()
});

export function registerPanelRoutes(app: Express, deps: PanelDeps): void {
  app.get("/api/panel/session", (req, res) => {
    res.json({
      ok: true,
      configured: Boolean(deps.config.PANEL_PASSWORD),
      authenticated: isAuthenticated(req, deps.config),
      storeName: deps.config.STORE_NAME
    });
  });

  app.post("/api/panel/login", (req, res) => {
    if (!deps.config.PANEL_PASSWORD) {
      res.status(503).json({ ok: false, setupRequired: true, error: "PANEL_PASSWORD is not configured" });
      return;
    }

    const password = String((req.body as { password?: unknown }).password ?? "");
    if (!safeEqual(password, deps.config.PANEL_PASSWORD)) {
      res.status(401).json({ ok: false, error: "Senha invalida" });
      return;
    }

    res.setHeader("Set-Cookie", buildSessionCookie(deps.config));
    res.json({ ok: true });
  });

  app.post("/api/panel/logout", (_req, res) => {
    res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ ok: true });
  });

  app.use("/api/panel", (req, res, next) => {
    if (!deps.config.PANEL_PASSWORD) {
      res.status(503).json({ ok: false, setupRequired: true, error: "PANEL_PASSWORD is not configured" });
      return;
    }
    if (!isAuthenticated(req, deps.config)) {
      res.status(401).json({ ok: false, error: "Nao autenticado" });
      return;
    }
    next();
  });

  app.get("/api/panel/overview", (_req, res) => {
    const summary = deps.db.getSalesSummary();
    const products = deps.db.getProductCount();
    res.json({
      ok: true,
      summary,
      products,
      providers: deps.registry.all().map((provider) => ({
        id: provider.id,
        label: provider.label,
        enabled: provider.enabled,
        webhook: Boolean(provider.handleWebhook)
      })),
      lowStock: deps.db.listLowStockProducts(8),
      recentOrders: deps.db.listRecentOrders(12)
    });
  });

  app.get("/api/panel/products", (_req, res) => {
    res.json({ ok: true, products: deps.db.listAllProducts() });
  });

  app.post("/api/panel/products", (req, res) => {
    const parsed = productInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join(", ") });
      return;
    }

    const product = deps.db.upsertProduct({
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || null,
      roleId: parsed.data.roleId || null,
      deliveryText: parsed.data.deliveryText || null
    });
    deps.db.insertAudit("panel", "product_upserted", product.sku, product);
    res.json({ ok: true, product });
  });

  app.post("/api/panel/products/:sku/deactivate", (req, res) => {
    deps.db.deactivateProduct(req.params.sku);
    deps.db.insertAudit("panel", "product_deactivated", req.params.sku, {});
    res.json({ ok: true });
  });

  app.get("/api/panel/orders", (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    res.json({ ok: true, orders: deps.db.listRecentOrders(limit) });
  });

  app.post("/api/panel/orders/:id/approve", async (req, res) => {
    await deps.orders.approveManualOrder(req.params.id, "panel");
    res.json({ ok: true });
  });

  app.post("/api/panel/orders/:id/reject", async (req, res) => {
    await deps.orders.rejectManualOrder(req.params.id, "panel");
    res.json({ ok: true });
  });
}

function parseCookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function buildSessionCookie(config: AppConfig): string {
  const expiresAt = Date.now() + sessionDurationMs;
  const payload = Buffer.from(JSON.stringify({ expiresAt }), "utf8").toString("base64url");
  const signature = sign(payload, config);
  const secure = config.PUBLIC_BASE_URL.startsWith("https://") ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(`${payload}.${signature}`)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${
    sessionDurationMs / 1000
  }${secure}`;
}

function isAuthenticated(req: Request, config: AppConfig): boolean {
  const token = parseCookies(req)[cookieName];
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, config))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: number };
    return typeof data.expiresAt === "number" && data.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function sign(payload: string, config: AppConfig): string {
  const secret = config.PANEL_SESSION_SECRET ?? config.PANEL_PASSWORD ?? "nexus-panel-development-secret";
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
