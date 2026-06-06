import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig } from "./config.js";
import { StoreDb } from "./db.js";
import { handleInteraction } from "./discord/handler.js";
import { createHttpServer } from "./http/server.js";
import { startOrderExpirationJob } from "./jobs/expire-orders.js";
import { logger } from "./logger.js";
import { PaymentRegistry } from "./payments/registry.js";
import { FulfillmentService } from "./services/fulfillment.js";
import { NotificationService } from "./services/notifications.js";
import { OrderService } from "./services/orders.js";

const config = loadConfig();
const db = new StoreDb(config.databasePath);
const registry = new PaymentRegistry(config);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const notifications = new NotificationService(client, config);
const fulfillment = new FulfillmentService(db, client, config, notifications);
const orders = new OrderService(db, registry, config, fulfillment, notifications);
const httpServer = createHttpServer(config, registry, orders, db);
const expirationJob = startOrderExpirationJob(db, notifications);

client.once("ready", async () => {
  logger.info(
    {
      user: client.user?.tag,
      providers: registry.enabled().map((provider) => provider.id)
    },
    "nexus_sell_bot_ready"
  );
  await notifications.log(`NexusSellBot online. Provedores: ${registry.enabled().map((provider) => provider.label).join(", ")}`);
});

client.on("interactionCreate", async (interaction) => {
  await handleInteraction(interaction, { client, config, db, registry, orders, fulfillment });
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutdown_started");
  clearInterval(expirationJob);
  await client.destroy();
  httpServer.close();
  db.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(config.DISCORD_TOKEN);
