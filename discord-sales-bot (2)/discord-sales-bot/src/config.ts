import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: optionalString,
  DISCORD_ADMIN_ROLE_ID: optionalString,
  DISCORD_LOG_CHANNEL_ID: optionalString,
  STORE_NAME: z.string().default("NexusSellBot"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default("./data/store.sqlite"),
  DEFAULT_CURRENCY: z.string().length(3).default("BRL"),
  ORDER_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(60),
  LOW_STOCK_ALERT_AT: z.coerce.number().int().nonnegative().default(3),
  PANEL_PASSWORD: optionalString,
  PANEL_SESSION_SECRET: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PAYMENT_METHODS: optionalString,
  MERCADOPAGO_ACCESS_TOKEN: optionalString,
  MERCADOPAGO_WEBHOOK_SECRET: optionalString,
  EFIBANK_CLIENT_ID: optionalString,
  EFIBANK_CLIENT_SECRET: optionalString,
  EFIBANK_CERTIFICATE_PATH: optionalString,
  EFIBANK_CERTIFICATE_BASE64: optionalString,
  EFIBANK_SANDBOX: z.coerce.boolean().default(true),
  EFIBANK_PIX_KEY: optionalString,
  EFIBANK_WEBHOOK_SECRET: optionalString,
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_WEBHOOK_ID: optionalString,
  PIX_KEY: optionalString,
  PIX_RECEIVER_NAME: optionalString,
  PIX_CITY: z.string().default("Sao Paulo"),
  PIX_DESCRIPTION: z.string().default("Pedido NexusSellBot"),
  ITAU_CLIENT_ID: optionalString,
  ITAU_CLIENT_SECRET: optionalString,
  ITAU_CERT_PATH: optionalString,
  ITAU_KEY_PATH: optionalString,
  ITAU_CERT_BASE64: optionalString,
  ITAU_KEY_BASE64: optionalString,
  ITAU_CERT_PASSPHRASE: optionalString,
  ITAU_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  ITAU_PIX_KEY: optionalString,
  ITAU_TOKEN_URL: optionalString,
  ITAU_PIX_BASE_URL: optionalString,
  ITAU_WEBHOOK_SECRET: optionalString,
  ASAAS_API_KEY: optionalString,
  ASAAS_BASE_URL: optionalString,
  ASAAS_CUSTOMER_ID: optionalString,
  ASAAS_BILLING_TYPE: optionalString,
  ASAAS_WEBHOOK_TOKEN: optionalString,
  PAGARME_SECRET_KEY: optionalString,
  PAGARME_BASE_URL: optionalString,
  PAGARME_PAYMENT_METHODS: optionalString,
  PAGARME_WEBHOOK_SECRET: optionalString,
  PAGSEGURO_EMAIL: optionalString,
  PAGSEGURO_TOKEN: optionalString,
  PAGSEGURO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CIELO_MERCHANT_ID: optionalString,
  CIELO_MERCHANT_KEY: optionalString,
  CIELO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CIELO_PAYMENT_TYPE: optionalString,
  CIELO_WEBHOOK_SECRET: optionalString,
  ADYEN_API_KEY: optionalString,
  ADYEN_MERCHANT_ACCOUNT: optionalString,
  ADYEN_CHECKOUT_BASE_URL: optionalString,
  ADYEN_ENV: z.enum(["test", "production"]).default("test"),
  ADYEN_COUNTRY_CODE: optionalString,
  ADYEN_SHOPPER_LOCALE: optionalString,
  ADYEN_HMAC_KEY: optionalString,
  SQUARE_ACCESS_TOKEN: optionalString,
  SQUARE_LOCATION_ID: optionalString,
  SQUARE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  SQUARE_WEBHOOK_SIGNATURE_KEY: optionalString,
  SQUARE_WEBHOOK_URL: optionalString,
  MOLLIE_API_KEY: optionalString,
  MOLLIE_METHODS: optionalString,
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  MANUAL_BANK_INSTRUCTIONS: optionalString,
  CUSTOM_WEBHOOK_SECRET: optionalString,
  CUSTOM_CHECKOUT_URL_TEMPLATE: optionalString
});

export type AppConfig = z.infer<typeof envSchema> & {
  databasePath: string;
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${message}`);
  }

  return {
    ...parsed.data,
    databasePath: path.resolve(process.cwd(), parsed.data.DATABASE_PATH)
  };
}
