import { convert } from "@vitico/pricing";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCents, formatForeign } from "@/lib/format";

export type PriceTagProps = {
  unitCents: number;
  baseCents: number;
  label: string;
  sellUnit: string;
  vatPercent: number;
  currency: { code: string; perFjd: number } | null;
  fcccSavingPercent?: number | null;
  size?: "sm" | "lg";
};

/** A customer's price for one sell unit, with savings and export currency hints. */
export function PriceTag({ unitCents, baseCents, label, sellUnit, vatPercent, currency, fcccSavingPercent, size = "sm" }: PriceTagProps) {
  const discounted = unitCents < baseCents;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("font-semibold tabular-nums tracking-tight", size === "lg" ? "text-3xl" : "text-lg")}>{formatCents(unitCents)}</span>
        {discounted && <span className="text-sm text-ink-muted line-through tabular-nums">{formatCents(baseCents)}</span>}
        <span className="text-xs text-ink-muted">/ {sellUnit}</span>
      </div>
      <div className="text-xs text-ink-muted">
        {vatPercent > 0 ? `excl. ${vatPercent}% VAT` : "VAT 0%"}
        {currency && ` · ${formatForeign(convert(unitCents, currency.perFjd), currency.code)}`}
      </div>
      <div className="flex flex-wrap gap-1">
        {discounted && <Badge tone="brand">{label.split(" · ")[0]}</Badge>}
        {fcccSavingPercent != null && fcccSavingPercent > 0 && <Badge tone="green">{fcccSavingPercent}% below FCCC</Badge>}
      </div>
    </div>
  );
}
