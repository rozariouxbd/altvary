/**
 * Money formatting. Every store has one currency (its Shopify default, stored on
 * `Store.currency` as an ISO 4217 code) and all its synced amounts are already in
 * that currency — so this is display formatting only, never conversion.
 *
 * `narrowSymbol` keeps symbols tight ($, €, £, ¥). Within a single store's own
 * dashboard the bare "$" is unambiguous (the merchant knows their currency), so
 * we don't prefix country codes.
 */
export function formatMoney(
  amount: number,
  currency: string = "USD",
  opts: { decimals?: number } = {}
): string {
  const decimals = opts.decimals ?? 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    // Unknown/invalid currency code → fall back to a plain grouped number with $.
    return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
}
