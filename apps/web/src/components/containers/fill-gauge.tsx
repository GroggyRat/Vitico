import { cn } from "@/lib/cn";

/** A horizontal fill bar: green below 90%, amber 90–100%, red over. */
export function FillGauge({ label, used, max, unit, decimals = 1 }: { label: string; used: number; max: number; unit: string; decimals?: number }) {
  const pct = max > 0 ? (used / max) * 100 : 0;
  const tone = pct > 100 ? "bg-red-600" : pct >= 90 ? "bg-amber-500" : "bg-brand-500";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums", pct > 100 && "font-semibold text-red-600")}>
          {used.toLocaleString(undefined, { maximumFractionDigits: decimals })} / {max.toLocaleString()} {unit} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-canvas" role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-3 rounded-full transition-all", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1 text-xs text-ink-muted">
        {pct > 100
          ? `Over by ${(used - max).toLocaleString(undefined, { maximumFractionDigits: decimals })} ${unit}`
          : `${(max - used).toLocaleString(undefined, { maximumFractionDigits: decimals })} ${unit} left`}
      </div>
    </div>
  );
}
