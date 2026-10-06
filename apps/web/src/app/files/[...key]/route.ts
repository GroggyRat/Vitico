import { staffCan } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getFile } from "@/lib/storage";
import { staffOrderScope } from "@/server/orders/orders";

const notFound = () => new Response("Not found", { status: 404 });

/** Serves private uploads (payment receipts) only to people allowed to see the order. */
export async function GET(_: Request, ctx: RouteContext<"/files/[...key]">) {
  const user = await getCurrentUser();
  if (!user) return notFound();
  const key = (await ctx.params).key.join("/");

  const payment = await getDb().payment.findFirst({ where: { proofKey: key }, include: { order: true } });
  if (!payment) return notFound();
  const allowed = user.staffRole
    ? staffCan(user.staffRole, "orders.view") &&
      !!(await getDb().order.findFirst({ where: { id: payment.orderId, ...staffOrderScope({ id: user.id, staffRole: user.staffRole }) } }))
    : user.companyId === payment.order.companyId;
  if (!allowed) return notFound();

  const file = await getFile(key);
  if (!file) return notFound();
  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
