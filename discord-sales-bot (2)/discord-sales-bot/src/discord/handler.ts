import {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import type { AppConfig } from "../config.js";
import { StoreDb } from "../db.js";
import { moneyToCents, formatMoney } from "../utils/money.js";
import { PaymentRegistry } from "../payments/registry.js";
import { OrderService } from "../services/orders.js";
import { FulfillmentService } from "../services/fulfillment.js";
import { checkoutMessage, orderMessage, productDetailMessage, productListMessage } from "./renderers.js";

type HandlerDeps = {
  client: Client;
  config: AppConfig;
  db: StoreDb;
  registry: PaymentRegistry;
  orders: OrderService;
  fulfillment: FulfillmentService;
};

function isAdmin(interaction: Interaction, config: AppConfig): boolean {
  if (!interaction.inGuild()) return false;
  const member = interaction.member;
  const permissions = "permissions" in member ? member.permissions : null;
  if (permissions && typeof permissions !== "string" && permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!config.DISCORD_ADMIN_ROLE_ID) return false;
  const roles = "roles" in member ? member.roles : null;
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.includes(config.DISCORD_ADMIN_ROLE_ID);
  return roles.cache.has(config.DISCORD_ADMIN_ROLE_ID);
}

async function requireAdmin(interaction: Interaction, config: AppConfig): Promise<boolean> {
  if (isAdmin(interaction, config)) return true;
  if (interaction.isRepliable()) {
    await interaction.reply({ content: "Voce nao tem permissao para isso.", flags: MessageFlags.Ephemeral });
  }
  return false;
}

export async function handleInteraction(interaction: Interaction, deps: HandlerDeps): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, deps);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "product-select") {
        const sku = interaction.values[0];
        const product = deps.db.getProductBySku(sku);
        if (!product) {
          await interaction.reply({ content: "Produto nao encontrado.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({ ...productDetailMessage(product, deps.registry.enabled()), flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.customId.startsWith("provider-select:")) {
        const [, sku, quantityRaw] = interaction.customId.split(":");
        const providerId = interaction.values[0];
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await deps.orders.createCheckout({
          user: interaction.user,
          sku,
          quantity: Number(quantityRaw || 1),
          providerId
        });
        await interaction.editReply(checkoutMessage(result.order, result.checkout));
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("admin-approve:")) {
        if (!(await requireAdmin(interaction, deps.config))) return;
        const orderId = interaction.customId.replace("admin-approve:", "");
        await deps.orders.approveManualOrder(orderId, interaction.user.id);
        await interaction.reply({ content: `Pedido ${orderId} aprovado.`, flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.customId.startsWith("admin-reject:")) {
        if (!(await requireAdmin(interaction, deps.config))) return;
        const orderId = interaction.customId.replace("admin-reject:", "");
        await deps.orders.rejectManualOrder(orderId, interaction.user.id);
        await interaction.reply({ content: `Pedido ${orderId} rejeitado.`, flags: MessageFlags.Ephemeral });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Erro: ${message}`, embeds: [], components: [] }).catch(() => undefined);
      } else {
        await interaction.reply({ content: `Erro: ${message}`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction, deps: HandlerDeps): Promise<void> {
  if (interaction.commandName === "loja") {
    const category = interaction.options.getString("categoria") ?? undefined;
    const products = deps.db.listProducts(category);
    await interaction.reply({ ...productListMessage(products), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === "comprar") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sku = interaction.options.getString("sku", true);
    const quantity = interaction.options.getInteger("quantidade") ?? 1;
    const providerId = interaction.options.getString("provedor") ?? undefined;
    const result = await deps.orders.createCheckout({ user: interaction.user, sku, quantity, providerId });
    await interaction.editReply(checkoutMessage(result.order, result.checkout));
    return;
  }

  if (interaction.commandName === "pedido") {
    const id = interaction.options.getString("id", true);
    const order = deps.db.getOrderById(id);
    if (!order || (order.discordUserId !== interaction.user.id && !isAdmin(interaction, deps.config))) {
      await interaction.reply({ content: "Pedido nao encontrado.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...orderMessage(order), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === "comprovante") {
    const id = interaction.options.getString("id", true);
    const attachment = interaction.options.getAttachment("arquivo", true);
    await deps.orders.submitManualProof(id, interaction.user, attachment.url);
    await interaction.reply({ content: "Comprovante recebido. Um admin vai validar o pedido.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === "painel-vendas") {
    if (!(await requireAdmin(interaction, deps.config))) return;
    const summary = deps.db.getSalesSummary();
    const recent = deps.db
      .listRecentOrders(5)
      .map((order) => `${order.status} | ${order.productName} | ${formatMoney(order.totalCents, order.currency)} | ${order.id}`)
      .join("\n");
    await interaction.reply({
      content: [
        `Pedidos: ${summary.totalOrders}`,
        `Pagos: ${summary.paidOrders}`,
        `Entregues: ${summary.fulfilledOrders}`,
        `Receita bruta: ${formatMoney(summary.grossRevenueCents, deps.config.DEFAULT_CURRENCY)}`,
        "",
        recent || "Sem pedidos recentes."
      ].join("\n"),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.commandName === "admin-produto") {
    if (!(await requireAdmin(interaction, deps.config))) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "criar") {
      const product = deps.db.upsertProduct({
        sku: interaction.options.getString("sku", true),
        name: interaction.options.getString("nome", true),
        priceCents: moneyToCents(interaction.options.getNumber("preco", true)),
        stock: interaction.options.getInteger("estoque", true),
        category: interaction.options.getString("categoria") ?? "geral",
        description: interaction.options.getString("descricao") ?? "",
        currency: deps.config.DEFAULT_CURRENCY,
        roleId: interaction.options.getRole("cargo")?.id ?? null,
        deliveryText: interaction.options.getString("entrega") ?? null,
        imageUrl: interaction.options.getString("imagem") ?? null
      });
      await interaction.reply({ content: `Produto salvo: ${product.sku} - ${product.name}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "estoque") {
      const product = deps.db.setProductStock(
        interaction.options.getString("sku", true),
        interaction.options.getInteger("quantidade", true)
      );
      await interaction.reply({ content: `Estoque de ${product.sku}: ${product.stock}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "desativar") {
      deps.db.deactivateProduct(interaction.options.getString("sku", true));
      await interaction.reply({ content: "Produto desativado.", flags: MessageFlags.Ephemeral });
      return;
    }
  }

  if (interaction.commandName === "admin-pedido") {
    if (!(await requireAdmin(interaction, deps.config))) return;
    const sub = interaction.options.getSubcommand();
    const id = interaction.options.getString("id", true);
    if (sub === "aprovar") {
      await deps.orders.approveManualOrder(id, interaction.user.id);
      await interaction.reply({ content: `Pedido ${id} aprovado.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "rejeitar") {
      await deps.orders.rejectManualOrder(id, interaction.user.id);
      await interaction.reply({ content: `Pedido ${id} rejeitado.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "entregar") {
      const order = deps.db.getOrderById(id);
      if (!order) throw new Error("Pedido nao encontrado");
      await deps.fulfillment.fulfill(order);
      await interaction.reply({ content: `Pedido ${id} entregue.`, flags: MessageFlags.Ephemeral });
    }
  }
}
