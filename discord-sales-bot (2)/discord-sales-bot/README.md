# NexusSellBot

Bot de vendas para Discord com catalogo, pedidos, estoque, entrega automatica por cargo/DM e pagamentos modulares.

## O que vem pronto

- Site premium em `public/`, servido em `/` pelo servidor HTTP do bot.
- Painel admin em `/panel`, com login por `PANEL_PASSWORD`, metricas, pedidos, produtos, estoque e gateways.
- Tema Shopify em `shopify-theme/` para vender o NexusSellBot por produto/carrinho Shopify.
- Slash commands: `/loja`, `/comprar`, `/pedido`, `/comprovante`, `/painel-vendas`, `/admin-produto`, `/admin-pedido`.
- Catalogo com categorias, estoque limitado ou ilimitado, imagem, entrega por texto e cargo do Discord.
- Pedidos com reserva de estoque, expiracao automatica, auditoria e eventos idempotentes.
- Webhooks para Stripe, Mercado Pago, Pagar.me, Asaas, Efibank Pix, Itau Pix, PagSeguro, Cielo, PayPal, Adyen, Square, Mollie, Razorpay e webhook custom.
- Pix normal copia-e-cola, fluxo manual para Pix/transferencia com comprovante e aprovacao por botao.
- SQLite local por padrao, facil de migrar depois para Postgres.

## Setup rapido

1. Instale dependencias:

```bash
npm install
```

2. Copie `.env.example` para `.env` e preencha pelo menos:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_ID=
DISCORD_LOG_CHANNEL_ID=
PUBLIC_BASE_URL=https://seu-dominio-ou-ngrok
```

3. Cadastre os comandos no Discord:

```bash
npm run register
```

4. Crie produtos de exemplo:

```bash
npm run seed
```

5. Rode:

```bash
npm run dev
```

## Webhooks

Use estes endpoints no gateway:

- Stripe: `POST /webhooks/stripe`
- Mercado Pago: `POST /webhooks/mercadopago`
- Pagar.me: `POST /webhooks/pagarme`
- Asaas: `POST /webhooks/asaas`
- Efibank Pix: `POST /webhooks/efibank?secret=SEU_SEGREDO`
- Itau Pix: `POST /webhooks/itau?secret=SEU_SEGREDO`
- PagSeguro: `POST /webhooks/pagseguro`
- Cielo: `POST /webhooks/cielo?secret=SEU_SEGREDO`
- PayPal: `POST /webhooks/paypal`
- Adyen: `POST /webhooks/adyen`
- Square: `POST /webhooks/square`
- Mollie: `POST /webhooks/mollie`
- Razorpay: `POST /webhooks/razorpay`
- Custom: `POST /webhooks/custom`

Em desenvolvimento, use ngrok, Cloudflare Tunnel ou outro tunel HTTPS e coloque a URL em `PUBLIC_BASE_URL`.

## Pagamentos

### Stripe

Preencha `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`. Opcionalmente defina:

```env
STRIPE_PAYMENT_METHODS=card,pix,boleto
```

### Mercado Pago

Preencha `MERCADOPAGO_ACCESS_TOKEN` e, se estiver usando assinatura de webhook, `MERCADOPAGO_WEBHOOK_SECRET`.

### Pagar.me / Stone

Cria link de pagamento Checkout V5 com cartao, Pix e boleto.

```env
PAGARME_SECRET_KEY=
PAGARME_BASE_URL=https://api.pagar.me/core/v5
PAGARME_PAYMENT_METHODS=credit_card,pix,boleto
PAGARME_WEBHOOK_SECRET=
```

### Asaas

Cria cobranca Asaas. Para Pix, o bot tambem busca o copia-e-cola dinamico.

```env
ASAAS_API_KEY=
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_CUSTOMER_ID=
ASAAS_BILLING_TYPE=PIX
ASAAS_WEBHOOK_TOKEN=
```

### Pix normal

Gera Pix copia-e-cola sem gateway. Como nao ha webhook bancario, o pedido fica pendente ate o cliente enviar comprovante com `/comprovante`.

```env
PIX_KEY=
PIX_RECEIVER_NAME=
PIX_CITY=Sao Paulo
PIX_DESCRIPTION=Pedido NexusSellBot
```

### Efibank

Preencha:

```env
EFIBANK_CLIENT_ID=
EFIBANK_CLIENT_SECRET=
EFIBANK_CERTIFICATE_PATH=./certs/producao.p12
EFIBANK_SANDBOX=true
EFIBANK_PIX_KEY=
EFIBANK_WEBHOOK_SECRET=
```

Configure a URL de webhook Pix na Efibank como:

```text
https://seu-dominio/webhooks/efibank?secret=EFIBANK_WEBHOOK_SECRET
```

### Itau Pix

Preencha:

```env
ITAU_CLIENT_ID=
ITAU_CLIENT_SECRET=
ITAU_ENV=sandbox
ITAU_PIX_KEY=
ITAU_CERT_PATH=./certs/itau-cert.crt
ITAU_KEY_PATH=./certs/itau-key.key
ITAU_CERT_BASE64=
ITAU_KEY_BASE64=
ITAU_CERT_PASSPHRASE=
ITAU_WEBHOOK_SECRET=
```

O provider usa OAuth client credentials e mTLS quando certificado/chave estao configurados. As URLs padrao sao:

```env
ITAU_TOKEN_URL=https://devportal.itau.com.br/api/jwt
ITAU_PIX_BASE_URL=https://devportal.itau.com.br/sandboxapi/pix_recebimentos_ext_v2/v2
```

Em producao, deixe `ITAU_ENV=production` ou defina as URLs fornecidas no seu contrato/portal Itau. Configure o webhook como:

```text
https://seu-dominio/webhooks/itau?secret=ITAU_WEBHOOK_SECRET
```

### PagSeguro

Usa o checkout classico do PagSeguro e consulta a notificacao para confirmar status.

```env
PAGSEGURO_EMAIL=
PAGSEGURO_TOKEN=
PAGSEGURO_ENV=sandbox
```

### Cielo

Integra Cielo E-commerce Pix. Em producao, confirme no contrato Cielo quais meios estao habilitados.

```env
CIELO_MERCHANT_ID=
CIELO_MERCHANT_KEY=
CIELO_ENV=sandbox
CIELO_PAYMENT_TYPE=Pix
CIELO_WEBHOOK_SECRET=
```

### PayPal

Preencha `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` e, para verificar webhook, `PAYPAL_WEBHOOK_ID`.

### Adyen

Cria link Adyen Pay by Link.

```env
ADYEN_API_KEY=
ADYEN_MERCHANT_ACCOUNT=
ADYEN_CHECKOUT_BASE_URL=
ADYEN_ENV=test
ADYEN_COUNTRY_CODE=BR
ADYEN_SHOPPER_LOCALE=pt-BR
ADYEN_HMAC_KEY=
```

### Square

Cria Square Online Checkout. Se validar webhook assinado, mantenha `SQUARE_WEBHOOK_URL` exatamente igual ao endpoint cadastrado na Square.

```env
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_ENV=sandbox
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_WEBHOOK_URL=
```

### Mollie

Cria pagamento Mollie e confirma via webhook buscando o pagamento na API.

```env
MOLLIE_API_KEY=
MOLLIE_METHODS=
```

### Razorpay

Cria Razorpay Payment Links.

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

### Qualquer banco/adquirente

Use o provider `custom`. A plataforma externa deve chamar:

```http
POST /webhooks/custom
X-Sales-Signature: hmac_sha256_hex_do_body
Content-Type: application/json

{
  "orderId": "id-do-pedido",
  "status": "paid",
  "eventId": "evento-unico"
}
```

## Comandos admin

Criar produto:

```text
/admin-produto criar sku:VIP-MENSAL nome:VIP Mensal preco:29.90 estoque:-1 cargo:@VIP entrega:Obrigado pela compra
```

Aprovar comprovante:

```text
/admin-pedido aprovar id:ID_DO_PEDIDO
```

Ou use os botoes no canal de logs.

## Deploy

```bash
npm run build
npm start
```

O processo abre o bot do Discord e o servidor HTTP na porta `PORT`.

Para Railway, veja:

```text
RAILWAY.md
railway.env.example
```

O site abre em:

```text
http://localhost:3000/
```

Tambem da para abrir `public/index.html` diretamente no navegador.

O painel admin abre em:

```text
http://localhost:3000/panel/
```

Configure antes:

```env
PANEL_PASSWORD=uma-senha-forte
PANEL_SESSION_SECRET=um-segredo-longo-aleatorio
```

## Shopify

A versao Shopify fica em:

```text
shopify-theme/
```

Ela inclui uma landing page Liquid com produto Shopify selecionavel, blocos de gateways e traducoes em ingles/portugues. No editor de temas, escolha a secao `NexusSellBot landing` e selecione o produto que representa o bot.

Para o tema exportado Horizon da loja `nexussellbot.myshopify.com`, a versao completa customizada esta em:

```text
horizon-nexussellbot-custom/
nexussellbot-horizon-custom-theme.zip
```

Arquivos alterados/adicionados no Horizon:

```text
sections/nexus-sell-bot-horizon.liquid
templates/index.json
templates/page.nexus-sell-bot.json
```

## Observacoes importantes

- Nao coloque segredo/token em mensagem publica do Discord.
- Efibank Pix usa certificado. Proteja o arquivo `.p12` ou use `EFIBANK_CERTIFICATE_BASE64`.
- Itau Pix em producao usa credenciais e certificado/chave mTLS. Confirme no portal Itau as URLs liberadas para o seu contrato.
- Para loja grande, recomendo trocar SQLite por Postgres quando houver muitos servidores, shards ou varios processos.
