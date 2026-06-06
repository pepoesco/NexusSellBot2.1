export type OrderStatus =
  | "created"
  | "pending_payment"
  | "manual_review"
  | "paid"
  | "fulfilled"
  | "canceled"
  | "expired"
  | "payment_failed"
  | "refunded";

export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  currency: string;
  stock: number;
  roleId: string | null;
  deliveryText: string | null;
  imageUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  discordUserId: string;
  discordUsername: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
  status: OrderStatus;
  paymentProvider: string | null;
  paymentReference: string | null;
  checkoutUrl: string | null;
  instructions: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  metadata: Record<string, unknown>;
};

export type CheckoutSession = {
  provider: string;
  reference: string;
  url: string | null;
  instructions?: string | null;
  expiresAt?: string | null;
};

export type PaymentUpdateStatus = "paid" | "pending" | "failed" | "expired" | "refunded" | "manual_review";

export type PaymentUpdate = {
  provider: string;
  eventId: string;
  eventType: string;
  status: PaymentUpdateStatus;
  orderId?: string;
  reference?: string;
  raw: unknown;
};

export type CheckoutInput = {
  order: Order;
  product: Product;
  publicBaseUrl: string;
};

export type PaymentProvider = {
  id: string;
  label: string;
  enabled: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  handleWebhook?(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer;
    body?: unknown;
    query?: Record<string, unknown>;
  }): Promise<PaymentUpdate[]>;
  captureReturn?(token: string, orderId?: string): Promise<PaymentUpdate[]>;
};

export function hasLimitedStock(product: Pick<Product, "stock">): boolean {
  return product.stock >= 0;
}
