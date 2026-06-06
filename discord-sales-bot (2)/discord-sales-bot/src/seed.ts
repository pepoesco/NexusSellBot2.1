import { loadConfig } from "./config.js";
import { StoreDb } from "./db.js";
import { moneyToCents } from "./utils/money.js";

const config = loadConfig();
const db = new StoreDb(config.databasePath);

db.upsertProduct({
  sku: "VIP-MENSAL",
  name: "VIP Mensal",
  description: "Acesso VIP por 30 dias. Configure um cargo no Discord para entrega automatica.",
  category: "acessos",
  priceCents: moneyToCents(29.9),
  currency: config.DEFAULT_CURRENCY,
  stock: -1,
  deliveryText: "Obrigado pela compra. Seu acesso VIP foi liberado."
});

db.upsertProduct({
  sku: "PACK-PREMIUM",
  name: "Pack Premium",
  description: "Produto digital premium com entrega por DM.",
  category: "digitais",
  priceCents: moneyToCents(149.9),
  currency: config.DEFAULT_CURRENCY,
  stock: 10,
  deliveryText: "Aqui vai o link/guia do seu produto premium. Edite este texto no admin-produto."
});

db.close();
console.log("Seed concluido para NexusSellBot.");
