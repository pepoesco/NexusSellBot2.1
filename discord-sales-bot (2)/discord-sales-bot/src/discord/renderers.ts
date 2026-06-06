import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";
import type { CheckoutSession, Order, PaymentProvider, Product } from "../domain.js";
import { formatMoney } from "../utils/money.js";

function stockText(product: Product): string {
  if (product.stock < 0) return "Ilimitado";
  if (product.stock === 0) return "Esgotado";
  return String(product.stock);
}

export function productListMessage(products: Product[]) {
  const embed = new EmbedBuilder()
    .setTitle("NexusSellBot")
    .setDescription(products.length ? "Selecione um produto para abrir o checkout." : "Nenhum produto ativo encontrado.")
    .setColor(0x2f80ed);

  for (const product of products.slice(0, 10)) {
    embed.addFields({
      name: `${product.name} (${product.sku})`,
      value: `${formatMoney(product.priceCents, product.currency)} | Estoque: ${stockText(product)} | ${product.category}`
    });
  }

  const components =
    products.length > 0
      ? [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("product-select")
              .setPlaceholder("Escolha um produto")
              .addOptions(
                products.slice(0, 25).map((product) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(product.name.slice(0, 100))
                    .setDescription(`${product.sku} | ${formatMoney(product.priceCents, product.currency)}`.slice(0, 100))
                    .setValue(product.sku.slice(0, 100))
                )
              )
          )
        ]
      : [];

  return { embeds: [embed], components };
}

export function productDetailMessage(product: Product, providers: PaymentProvider[]) {
  const embed = new EmbedBuilder()
    .setTitle(product.name)
    .setDescription(product.description || "Sem descricao.")
    .setColor(0x27ae60)
    .addFields(
      { name: "SKU", value: product.sku, inline: true },
      { name: "Preco", value: formatMoney(product.priceCents, product.currency), inline: true },
      { name: "Estoque", value: stockText(product), inline: true }
    );
  if (product.imageUrl) embed.setImage(product.imageUrl);

  const providerSelect = new StringSelectMenuBuilder()
    .setCustomId(`provider-select:${product.sku}:1`)
    .setPlaceholder("Escolha o pagamento")
    .addOptions(
      providers.slice(0, 25).map((provider) =>
        new StringSelectMenuOptionBuilder().setLabel(provider.label.slice(0, 100)).setValue(provider.id.slice(0, 100))
      )
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(providerSelect)]
  };
}

export function checkoutMessage(order: Order, checkout: CheckoutSession) {
  const embed = new EmbedBuilder()
    .setTitle("Checkout criado")
    .setColor(0xf2c94c)
    .addFields(
      { name: "Pedido", value: order.id },
      { name: "Produto", value: `${order.productName} x${order.quantity}`, inline: true },
      { name: "Valor", value: formatMoney(order.totalCents, order.currency), inline: true },
      { name: "Pagamento", value: checkout.provider, inline: true },
      { name: "Status", value: order.status, inline: true }
    );

  const rows = [];
  if (checkout.url) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel("Abrir checkout").setStyle(ButtonStyle.Link).setURL(checkout.url)
      )
    );
  }

  return {
    content: checkout.instructions ? checkout.instructions.slice(0, 1900) : undefined,
    embeds: [embed],
    components: rows
  };
}

export function orderMessage(order: Order) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Pedido ${order.id}`)
        .setColor(order.status === "fulfilled" ? 0x27ae60 : order.status === "payment_failed" ? 0xeb5757 : 0x2f80ed)
        .addFields(
          { name: "Produto", value: `${order.productName} x${order.quantity}` },
          { name: "Valor", value: formatMoney(order.totalCents, order.currency), inline: true },
          { name: "Status", value: order.status, inline: true },
          { name: "Pagamento", value: order.paymentProvider ?? "n/a", inline: true }
        )
    ]
  };
}

export function manualReviewButtons(orderId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`admin-approve:${orderId}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`admin-reject:${orderId}`).setLabel("Rejeitar").setStyle(ButtonStyle.Danger)
    )
  ];
}
