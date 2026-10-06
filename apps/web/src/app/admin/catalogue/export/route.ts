import { getCurrentUser } from "@/lib/auth/session";
import { staffCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { exportProductsCsv } from "@/server/services/catalogue";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !staffCan(user.staffRole, "catalogue.view")) return new Response("Not found", { status: 404 });
  const csv = await exportProductsCsv(getDb());
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vitico-products-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
