import { Badge } from "@/components/ui/badge";
import type { StockStatus } from "@/server/services/stock";

const labels: Record<StockStatus, string> = { in_stock: "In stock", low: "Low stock", out: "Out of stock" };
const tones = { in_stock: "green", low: "amber", out: "red" } as const;

export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <div>
      <Badge tone={tones[status]}>{labels[status]}</Badge>
    </div>
  );
}
