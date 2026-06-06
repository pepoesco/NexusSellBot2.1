import express, { type Request, type Response } from "express";
import helmet from "helmet";
import type { Server } from "node:http";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { StoreDb } from "../db.js";
import { registerPanelRoutes } from "./panel.js";
import { PaymentRegistry } from "../payments/registry.js";
import { OrderService } from "../services/orders.js";
import { logger } from "../logger.js";

function html(title: string, message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,Segoe UI,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.5">
<h1>${title}</h1><p>${message}</p>
</body></html>`;
}

export function createHttpServer(config: AppConfig, registry: PaymentRegistry, orders: OrderService, db: StoreDb): Server {
  const app = express();
  app.use(helmet());
  app.use(express.static(path.resolve(process.cwd(), "public"), { extensions: ["html"] }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "NexusSellBot" });
  });

  app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    await handleProviderWebhook("stripe", req, res, registry, orders, { raw: true });
  });

  app.post("/webhooks/custom", express.raw({ type: "application/json" }), async (req, res) => {
    await handleProviderWebhook("custom", req, res, registry, orders, { raw: true });
  });

  for (const providerId of ["pagarme", "pagseguro", "square", "razorpay", "mollie"]) {
    app.post(`/webhooks/${providerId}`, express.raw({ type: "*/*" }), async (req, res) => {
      await handleProviderWebhook(providerId, req, res, registry, orders, { raw: true });
    });
  }

  app.use(express.json({ limit: "1mb" }));

  registerPanelRoutes(app, { config, db, registry, orders });

  app.post("/webhooks/mercadopago", async (req, res) => {
    await handleProviderWebhook("mercadopago", req, res, registry, orders);
  });

  app.post("/webhooks/efibank", async (req, res) => {
    await handleProviderWebhook("efibank", req, res, registry, orders);
  });

  app.post("/webhooks/itau", async (req, res) => {
    await handleProviderWebhook("itau", req, res, registry, orders);
  });

  app.post("/webhooks/paypal", async (req, res) => {
    await handleProviderWebhook("paypal", req, res, registry, orders);
  });

  for (const providerId of ["asaas", "cielo", "adyen"]) {
    app.post(`/webhooks/${providerId}`, async (req, res) => {
      await handleProviderWebhook(providerId, req, res, registry, orders);
    });
  }

  app.get("/paypal/return", async (req, res) => {
    try {
      const token = String(req.query.token ?? "");
      const orderId = req.query.orderId ? String(req.query.orderId) : undefined;
      const provider = registry.get("paypal");
      if (!provider.captureReturn) throw new Error("PayPal return capture is not available");
      const updates = await provider.captureReturn(token, orderId);
      await orders.applyPaymentUpdates(updates);
      res.send(html("Pagamento recebido", "Pode voltar ao Discord. O NexusSellBot vai entregar seu pedido automaticamente."));
    } catch (error) {
      logger.error({ error }, "paypal_return_failed");
      res.status(400).send(html("Falha no pagamento", error instanceof Error ? error.message : "Erro desconhecido"));
    }
  });

  app.get("/payment/success", (_req, res) => {
    res.send(html("Pagamento em processamento", "Pode voltar ao Discord. Assim que o webhook confirmar, o NexusSellBot entrega o pedido."));
  });

  app.get("/payment/pending", (_req, res) => {
    res.send(html("Pagamento pendente", "Seu pagamento esta pendente. O NexusSellBot vai atualizar o pedido quando o gateway confirmar."));
  });

  app.get("/payment/cancel", (_req, res) => {
    res.send(html("Checkout cancelado", "Voce pode voltar ao Discord e criar outro pedido quando quiser."));
  });

  return app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "http_server_ready");
  });
}

async function handleProviderWebhook(
  providerId: string,
  req: Request,
  res: Response,
  registry: PaymentRegistry,
  orders: OrderService,
  options: { raw?: boolean } = {}
): Promise<void> {
  try {
    const provider = registry.get(providerId);
    if (!provider.handleWebhook) {
      res.status(404).json({ ok: false, error: "provider has no webhook" });
      return;
    }
    const updates = await provider.handleWebhook({
      headers: req.headers,
      rawBody: options.raw && Buffer.isBuffer(req.body) ? req.body : undefined,
      body: options.raw ? undefined : req.body,
      query: req.query as Record<string, unknown>
    });
    await orders.applyPaymentUpdates(updates);
    res.json({ ok: true, received: updates.length });
  } catch (error) {
    logger.error({ providerId, error }, "webhook_failed");
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
