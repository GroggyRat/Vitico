import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { toBusinessInput } from "@/lib/time";
import { statusLabel } from "@/server/orders/status";
import { toCsv } from "@/server/reports/service";

/** The signed-in customer's orders as CSV, one row per order line. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.companyId) return new Response("Not found", { status: 404 });
  const orders = await getDb().order.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    include: { lines: { orderBy: { sku: "asc" } } },
  });
  const rows = orders.flatMap((o) =>
    o.lines.map((l) => [
      o.number,
      toBusinessInput(o.submittedAt ?? o.createdAt, true),
      statusLabel[o.status],
      o.poNumber,
      l.sku,
      l.name,
      l.qty,
      Number(l.unitPrice),
      Number(l.lineNet),
      Number(l.lineVat),
    ]),
  );
  const csv = toCsv(["Order", "Date", "Status", "PO number", "SKU", "Product", "Qty", "Unit price excl. VAT (FJD)", "Net (FJD)", "VAT (FJD)"], rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vitico-orders.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
