import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { staffCan } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";
import { dealPhase, phaseLabel } from "@/server/deals/service";
import { phaseTone } from "./phase";

export const metadata: Metadata = { title: "Deal Drops" };

export default async function DealsPage() {
  const { user } = await requireStaff("deals.manage");
  const db = getDb();
  const [deals, held, pendingBonds] = await Promise.all([
    db.dealDrop.findMany({ orderBy: [{ startsAt: "desc" }], take: 100 }),
    db.dealReservation.groupBy({ by: ["dealId"], where: { status: { in: ["PENDING_BOND", "SECURED", "COMPLETED"] } }, _sum: { units: true } }),
    db.dealReservation.count({ where: { status: "PENDING_BOND" } }),
  ]);
  const taken = new Map(held.map((h) => [h.dealId, h._sum.units ?? 0]));
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Deal Drops"
        description="Time-limited bundles at a set price. Customers secure units with a non-refundable bond and complete the purchase later."
        actions={
          <div className="flex flex-wrap gap-2">
            {staffCan(user.staffRole, "payments.verify") && (
              <Link href="/admin/deals/bonds" className={buttonClass("secondary")}>
                Bonds to verify ({pendingBonds})
              </Link>
            )}
            <Link href="/admin/deals/new" className={buttonClass()}>
              New deal
            </Link>
          </div>
        }
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Deal</Th>
              <Th>Status</Th>
              <Th className="text-right">Price / unit</Th>
              <Th className="text-right">Units taken</Th>
              <Th>Runs</Th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && <EmptyRow colSpan={5}>No deals yet.</EmptyRow>}
            {deals.map((d) => {
              const phase = dealPhase(d, now);
              return (
                <tr key={d.id}>
                  <Td>
                    <Link href={`/admin/deals/${d.id}`} className="font-medium text-brand-700 hover:underline">
                      {d.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={phaseTone[phase]}>{phaseLabel[phase]}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatFJD(d.dealPrice)}</Td>
                  <Td className="text-right tabular-nums">
                    {taken.get(d.id) ?? 0} of {d.totalUnits}
                  </Td>
                  <Td className="text-ink-muted">
                    {formatDateTime(d.startsAt)} to {formatDateTime(d.endsAt)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
