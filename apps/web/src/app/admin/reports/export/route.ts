import { staffCan } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { reportParams } from "@/server/reports/range";
import { rebateBalanceReport, salesGroupLabel, salesReport, stockReport, toCsv } from "@/server/reports/service";

const money = (cents: number | null) => (cents === null ? null : Number((cents / 100).toFixed(2)));

/** CSV downloads for the admin reports. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.staffRole || !staffCan(user.staffRole, "reports.view")) return new Response("Not found", { status: 404 });
  const actor = { id: user.id, staffRole: user.staffRole };
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  const db = getDb();
  let name: string;
  let csv: string;

  switch (params.report) {
    case "stock": {
      const rows = await stockReport(db, actor);
      name = "stock";
      csv = toCsv(
        ["SKU", "Product", "Category", "Active", "On hand", "Held for orders", "Held for deals", "Available", "Value at cost (FJD)"],
        rows.map((r) => [r.sku, r.name, r.category, r.active, r.onHand, r.reserved, r.allocated, r.available, money(r.costValueCents)]),
      );
      break;
    }
    case "rebates": {
      const rows = await rebateBalanceReport(db, actor);
      name = "rebate-balances";
      csv = toCsv(["Customer", "Available (FJD)", "Pending (FJD)"], rows.map((r) => [r.company, money(r.availableCents), money(r.pendingCents)]));
      break;
    }
    default: {
      const { from, to, fromInput, toInput, group } = reportParams(params);
      const rows = await salesReport(db, actor, { from, to, group });
      name = `sales-by-${group}-${fromInput}-to-${toInput}`;
      csv = toCsv(
        [salesGroupLabel[group], "Orders", ...(group === "product" ? ["Units"] : []), "Net (FJD)", "VAT (FJD)", "Total (FJD)"],
        rows.map((r) => [r.label, r.orders, ...(group === "product" ? [r.units] : []), money(r.netCents), money(r.vatCents), money(r.totalCents)]),
      );
    }
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vitico-${name}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
