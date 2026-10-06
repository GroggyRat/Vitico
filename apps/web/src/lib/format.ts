type DecimalLike = { toString(): string } | number | string | null | undefined;

/** VITICO operates on Fiji time; render dates the same regardless of server timezone. */
const TZ = "Pacific/Fiji";

const fjd = new Intl.NumberFormat("en-FJ", { style: "currency", currency: "FJD", currencyDisplay: "narrowSymbol" });

export function formatFJD(value: DecimalLike): string {
  if (value === null || value === undefined) return "—";
  return fjd.format(Number(value.toString()));
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-FJ", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-FJ", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function formatUplift(type: string, value: DecimalLike): string {
  if (type === "NONE") return "—";
  return type === "PERCENT" ? `+${Number(value)}%` : `+${formatFJD(value)} / unit`;
}
