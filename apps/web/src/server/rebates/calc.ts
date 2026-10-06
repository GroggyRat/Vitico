import type { RebatePeriod } from "@vitico/db/browser";
import { parseBusinessTime, toBusinessInput } from "@/lib/time";

export type Step = { threshold: number; percent: number };

/** Validates and sorts spend-target steps (thresholds in FJD). */
export function parseSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => ({ threshold: Number((s as Step).threshold), percent: Number((s as Step).percent) }))
    .filter((s) => Number.isFinite(s.threshold) && s.threshold > 0 && Number.isFinite(s.percent) && s.percent > 0 && s.percent <= 100)
    .sort((a, b) => a.threshold - b.threshold);
}

/** The highest step reached for a spend (cents), and the next one to aim for. */
export function stepProgress(steps: Step[], spendCents: number) {
  const reached = [...steps].reverse().find((s) => spendCents >= s.threshold * 100) ?? null;
  const next = steps.find((s) => spendCents < s.threshold * 100) ?? null;
  return {
    reached,
    next,
    remainingCents: next ? next.threshold * 100 - spendCents : 0,
    earnedCents: reached ? Math.round((spendCents * reached.percent) / 100) : 0,
  };
}

/** Calendar period containing `at`, in Fiji time: key like 2026-10, 2026-Q4, 2026; [start, end). */
export function periodBounds(period: RebatePeriod, at: Date) {
  const [y, m] = toBusinessInput(at, true).split("-").map(Number);
  const startY = y;
  let startM = m;
  let months = 1;
  let key = `${y}-${String(m).padStart(2, "0")}`;
  if (period === "QUARTER") {
    const q = Math.ceil(m / 3);
    startM = (q - 1) * 3 + 1;
    months = 3;
    key = `${y}-Q${q}`;
  } else if (period === "YEAR") {
    startM = 1;
    months = 12;
    key = String(y);
  }
  const endTotal = startM - 1 + months;
  const endY = startY + Math.floor(endTotal / 12);
  const endM = (endTotal % 12) + 1;
  const fmt = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  return { key, start: parseBusinessTime(fmt(startY, startM))!, end: parseBusinessTime(fmt(endY, endM))! };
}

/** The most recent period that has fully ended before `at`. */
export function previousPeriod(period: RebatePeriod, at: Date) {
  const current = periodBounds(period, at);
  return periodBounds(period, new Date(current.start.getTime() - 1));
}

export type CashbackLine = { sku: string; categoryId: string; netCents: number };

/** Cashback on the eligible part of an order. */
export function cashbackCents(lines: CashbackLine[], rule: { percent: number; categoryIds: string[]; skus: string[] }) {
  const anyFilter = rule.categoryIds.length > 0 || rule.skus.length > 0;
  const eligible = lines.filter((l) => !anyFilter || rule.categoryIds.includes(l.categoryId) || rule.skus.includes(l.sku));
  return Math.round((eligible.reduce((s, l) => s + l.netCents, 0) * rule.percent) / 100);
}
