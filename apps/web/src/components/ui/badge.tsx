import { cn } from "@/lib/cn";

const tones = {
  neutral: "text-ink-muted",
  brand: "text-brand-700",
  green: "text-emerald-700",
  amber: "text-amber-800",
  red: "text-red-700",
};

export type BadgeTone = keyof typeof tones;

/** A short status word in plain coloured text. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={cn("text-xs font-medium", tones[tone])}>{children}</span>;
}
