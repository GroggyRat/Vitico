import type { Metadata } from "next";
import Link from "next/link";
import { Countdown } from "@/components/deals/countdown";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { liveDealsFor, priceDeal } from "@/server/deals/service";

export const metadata: Metadata = { title: "Deal Drops" };

export default async function DealsPage() {
  const { company } = await requireCustomer();
  const db = getDb();
  const live = await liveDealsFor(db, company);
  const priced = await Promise.all(live.map((l) => priceDeal(db, l.deal, company.id, 1)));
  return (
    <>
      <PageHeader title="Deal Drops" description="Limited bundles at a set price. Secure units with a bond, then complete the purchase within the time shown." />
      {live.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-ink-muted">No deals on right now. We&apos;ll let you know when the next one drops.</Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {live.map(({ deal, left, mine }, i) => {
            const p = priced[i];
            return (
              <li key={deal.id}>
                <Card className="flex h-full flex-col p-5">
                  <Link href={`/portal/deals/${deal.id}`} className="text-lg font-semibold hover:text-brand-700">
                    {deal.name}
                  </Link>
                  <p className="mt-1 text-sm text-ink-muted">
                    {deal.items.map((it) => `${it.qtyPerDeal} x ${it.product.name}`).join(", ")}
                  </p>
                  <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-2xl font-semibold tabular-nums">{formatCents(p.subtotalCents)}</span>
                    {p.normalNetCents > p.subtotalCents && <span className="text-sm text-ink-muted line-through tabular-nums">{formatCents(p.normalNetCents)}</span>}
                    <span className="text-xs text-ink-muted">per unit, excl. VAT</span>
                  </div>
                  <p className="mt-3 text-sm">
                    {left > 0 ? `${left} of ${deal.totalUnits} units left` : "Sold out"}
                    {mine > 0 && <span className="text-ink-muted">. You have {mine}.</span>}
                  </p>
                  <p className="mt-auto pt-3 text-sm text-ink-muted">
                    <Countdown endsAt={deal.endsAt.toISOString()} />
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
