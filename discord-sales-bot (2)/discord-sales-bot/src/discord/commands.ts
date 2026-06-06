import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { PaymentProvider } from "../domain.js";

export function buildCommands(providers: PaymentProvider[]) {
  const providerChoices = providers.slice(0, 25).map((provider) => ({
    name: provider.label,
    value: provider.id
  }));

  return [
    new SlashCommandBuilder()
      .setName("loja")
      .setDescription("Abre o catalogo do NexusSellBot")
      .addStringOption((option) => option.setName("categoria").setDescription("Filtrar por categoria").setRequired(false)),

    new SlashCommandBuilder()
      .setName("comprar")
      .setDescription("Cria um pedido e checkout")
      .addStringOption((option) => option.setName("sku").setDescription("SKU do produto").setRequired(true))
      .addIntegerOption((option) => option.setName("quantidade").setDescription("Quantidade").setMinValue(1).setRequired(false))
      .addStringOption((option) =>
        option.setName("provedor").setDescription("Gateway de pagamento").setRequired(false).addChoices(...providerChoices)
      ),

    new SlashCommandBuilder()
      .setName("pedido")
      .setDescription("Consulta um pedido")
      .addStringOption((option) => option.setName("id").setDescription("ID do pedido").setRequired(true)),

    new SlashCommandBuilder()
      .setName("comprovante")
      .setDescription("Envia comprovante para pagamento manual")
      .addStringOption((option) => option.setName("id").setDescription("ID do pedido").setRequired(true))
      .addAttachmentOption((option) => option.setName("arquivo").setDescription("Imagem/PDF do comprovante").setRequired(true)),

    new SlashCommandBuilder()
      .setName("painel-vendas")
      .setDescription("Mostra resumo de vendas")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("admin-produto")
      .setDescription("Gerencia produtos")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName("criar")
          .setDescription("Cria ou atualiza produto")
          .addStringOption((option) => option.setName("sku").setDescription("SKU unico").setRequired(true))
          .addStringOption((option) => option.setName("nome").setDescription("Nome").setRequired(true))
          .addNumberOption((option) => option.setName("preco").setDescription("Preco em reais").setMinValue(0).setRequired(true))
          .addIntegerOption((option) => option.setName("estoque").setDescription("-1 para ilimitado").setRequired(true))
          .addStringOption((option) => option.setName("categoria").setDescription("Categoria").setRequired(false))
          .addStringOption((option) => option.setName("descricao").setDescription("Descricao").setRequired(false))
          .addRoleOption((option) => option.setName("cargo").setDescription("Cargo entregue apos pagamento").setRequired(false))
          .addStringOption((option) => option.setName("entrega").setDescription("Texto entregue por DM").setRequired(false))
          .addStringOption((option) => option.setName("imagem").setDescription("URL da imagem").setRequired(false))
      )
      .addSubcommand((sub) =>
        sub
          .setName("estoque")
          .setDescription("Atualiza estoque")
          .addStringOption((option) => option.setName("sku").setDescription("SKU").setRequired(true))
          .addIntegerOption((option) => option.setName("quantidade").setDescription("-1 para ilimitado").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName("desativar")
          .setDescription("Desativa um produto")
          .addStringOption((option) => option.setName("sku").setDescription("SKU").setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName("admin-pedido")
      .setDescription("Gerencia pedidos")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName("aprovar")
          .setDescription("Aprova pedido manual")
          .addStringOption((option) => option.setName("id").setDescription("ID do pedido").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName("rejeitar")
          .setDescription("Rejeita pedido manual")
          .addStringOption((option) => option.setName("id").setDescription("ID do pedido").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName("entregar")
          .setDescription("Forca entrega de um pedido pago")
          .addStringOption((option) => option.setName("id").setDescription("ID do pedido").setRequired(true))
      )
  ].map((command) => command.toJSON());
}
