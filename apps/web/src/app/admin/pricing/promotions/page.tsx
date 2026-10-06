import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime, formatFJD } from "@/lib/format";
import { PricingTabs } from "../tabs";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage({ searchParams }: PageProps<"/admin/pricing/promotions">) {
  await requireStaff("settings.pricing");
  const { saved } = await searchParams;
  const promos = await getDb().promotion.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { products: true } } } });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Pricing"
        actions={
          <Link href="/admin/pricing/promotions/new" className={buttonClass()}>
            New promotion
          </Link>
        }
      />
      <PricingTabs />
      {saved && <div className="mb-4"><FormMessage state={{ ok: true, message: "Promotion saved." }} /></div>}
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Promotion</Th>
              <Th>Discount</Th>
              <Th>When</Th>
              <Th className="text-right">Products</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 && <EmptyRow colSpan={5}>No promotions yet.</EmptyRow>}
            {promos.map((p) => {
              const status = !p.active ? "Off" : p.endsAt && p.endsAt < now ? "Ended" : p.startsAt && p.startsAt > now ? "Scheduled" : "Live";
              return (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/admin/pricing/promotions/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    {(p.tierIds.length > 0 || p.regionIds.length > 0) && (
                      <div className="text-xs text-ink-muted">
                        {p.tierIds.length > 0 && `${p.tierIds.length} tier(s) `}
                        {p.regionIds.length > 0 && `${p.regionIds.length} region(s)`}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {p.kind === "PERCENT_OFF" ? `${Number(p.value)}% off` : `${formatFJD(p.value)} each`}
                    {p.minQty > 1 && <span className="text-xs text-ink-muted"> · {p.minQty}+</span>}
                  </Td>
                  <Td className="text-xs text-ink-muted">
                    {p.startsAt ? formatDateTime(p.startsAt) : "Now"} to {p.endsAt ? formatDateTime(p.endsAt) : "no end"}
                  </Td>
                  <Td className="text-right tabular-nums">{p._count.products}</Td>
                  <Td>
                    <Badge tone={status === "Live" ? "green" : status === "Scheduled" ? "amber" : "neutral"}>{status}</Badge>
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
