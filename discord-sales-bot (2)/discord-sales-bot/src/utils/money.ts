export function formatMoney(cents: number, currency: string, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function moneyToCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Money value must be a non-negative finite number");
  }

  return Math.round(value * 100);
}

export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}
