import { REST, Routes } from "discord.js";
import { loadConfig } from "./config.js";
import { buildCommands } from "./discord/commands.js";
import { PaymentRegistry } from "./payments/registry.js";
import { logger } from "./logger.js";

const config = loadConfig();
const registry = new PaymentRegistry(config);
const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const body = buildCommands(registry.enabled());

if (config.DISCORD_GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body });
  logger.info({ count: body.length, guild: config.DISCORD_GUILD_ID }, "guild_commands_registered");
} else {
  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  logger.info({ count: body.length }, "global_commands_registered");
}
