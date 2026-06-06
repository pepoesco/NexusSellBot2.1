# Deploy na Railway

Este projeto ja esta preparado para Railway com `railway.json`, Dockerfile e healthcheck em `/health`.

## 1. Antes de subir

O token que apareceu fora de um cofre de segredos deve ser considerado vazado. Gere outro em Discord Developer Portal antes de publicar.

Rode localmente:

```bash
npm install
npm run lint
npm test
npm run build
```

## 2. Criar o servico

1. Suba este projeto para um repositorio GitHub.
2. Na Railway, crie um novo projeto a partir do repositorio.
3. O arquivo `railway.json` forca build por Dockerfile, usa `npm start` e espera `/health` retornar 200 antes de ativar o deploy.
4. Gere um dominio publico no servico e coloque esse dominio em `PUBLIC_BASE_URL`.

## 3. Variaveis

Use `railway.env.example` como checklist em Railway > Service > Variables.

Nao crie `PORT` manualmente. A Railway injeta `PORT` e o bot ja escuta essa variavel.

Obrigatorias para ligar:

```env
NODE_ENV=production
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
PUBLIC_BASE_URL=https://seu-app.up.railway.app
DATABASE_PATH=/app/data/store.sqlite
PANEL_PASSWORD=
PANEL_SESSION_SECRET=
```

## 4. Persistencia

SQLite fica em `/app/data/store.sqlite`. Para nao perder produtos/pedidos em redeploy:

1. Crie um Volume na Railway.
2. Monte o volume em `/app/data`.
3. Mantenha `DATABASE_PATH=/app/data/store.sqlite`.

Para certificados de banco, prefira variavel base64:

```env
EFIBANK_CERTIFICATE_BASE64=
```

Se usar arquivos de certificado do Itau, monte outro volume em `/app/certs` e aponte:

```env
ITAU_CERT_PATH=/app/certs/itau-cert.crt
ITAU_KEY_PATH=/app/certs/itau-key.key
```

Na Railway tambem da para evitar arquivo e usar:

```env
ITAU_CERT_BASE64=
ITAU_KEY_BASE64=
```

## 5. Webhooks

Depois do primeiro deploy, configure webhooks com o dominio da Railway:

```text
https://seu-app.up.railway.app/webhooks/stripe
https://seu-app.up.railway.app/webhooks/mercadopago
https://seu-app.up.railway.app/webhooks/pagarme
https://seu-app.up.railway.app/webhooks/asaas
https://seu-app.up.railway.app/webhooks/efibank?secret=EFIBANK_WEBHOOK_SECRET
https://seu-app.up.railway.app/webhooks/itau?secret=ITAU_WEBHOOK_SECRET
https://seu-app.up.railway.app/webhooks/pagseguro
https://seu-app.up.railway.app/webhooks/cielo?secret=CIELO_WEBHOOK_SECRET
https://seu-app.up.railway.app/webhooks/paypal
https://seu-app.up.railway.app/webhooks/adyen
https://seu-app.up.railway.app/webhooks/square
https://seu-app.up.railway.app/webhooks/mollie
https://seu-app.up.railway.app/webhooks/razorpay
https://seu-app.up.railway.app/webhooks/custom
```

Cadastre os comandos do Discord uma vez no ambiente da Railway:

```bash
npm run register
```

## 6. Providers incluidos

O bot ativa automaticamente o provider quando as variaveis obrigatorias existem:

- `stripe`: Stripe Checkout.
- `mercadopago`: Mercado Pago.
- `pagarme`: Pagar.me Checkout V5.
- `asaas`: cobranca Asaas, incluindo Pix.
- `efibank`: Pix Efi/Efibank.
- `itau`: Pix Recebimentos Itau com OAuth e mTLS em producao.
- `pagseguro`: checkout PagSeguro.
- `cielo`: Cielo E-commerce Pix.
- `paypal`: PayPal Orders.
- `adyen`: Adyen Pay by Link.
- `square`: Square Online Checkout.
- `mollie`: Mollie Payments.
- `razorpay`: Razorpay Payment Links.
- `pix`: Pix copia e cola estatico.
- `custom`: adapter universal para banco/adquirente que envie webhook.
- `manual`: transferencia/Pix manual com comprovante.
