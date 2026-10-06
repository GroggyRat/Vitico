import { formatCents } from "@/lib/format";
import type { spendTargetProgress } from "@/server/rebates/service";

export function TargetProgress({ items }: { items: Awaited<ReturnType<typeof spendTargetProgress>> }) {
  return (
    <div className="space-y-4">
      {items.map((t) => {
        const top = t.steps.at(-1)!;
        const pct = Math.min(100, (t.spendCents / (top.threshold * 100)) * 100);
        return (
          <div key={t.rule.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{t.rule.name}</span>
              <span className="text-ink-muted">
                {t.period.key}: {formatCents(t.spendCents)} spent
              </span>
            </div>
            <div className="relative mt-2 h-2.5 rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t.rule.name}>
              <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              {t.steps.map((s) => (
                <span key={s.threshold} className="absolute top-0 h-2.5 w-0.5 bg-surface" style={{ left: `${(s.threshold / top.threshold) * 100}%` }} />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {t.next
                ? `Spend ${formatCents(t.remainingCents)} more this period to earn ${t.next.percent}% back${t.reached ? ` (currently ${t.reached.percent}% = ${formatCents(t.earnedCents)})` : ""}.`
                : `Top step reached — you'll earn ${t.reached!.percent}% (${formatCents(t.earnedCents)}) at period end.`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
