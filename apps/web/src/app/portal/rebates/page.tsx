import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatCents, formatDate, formatFJD } from "@/lib/format";
import { TargetProgress } from "@/components/rebates/target-progress";
import { rulesFor, spendTargetProgress, walletBalance } from "@/server/rebates/service";

export const metadata: Metadata = { title: "Rebates" };

export default async function RebatesPage() {
  const { actor, company } = await requireCustomer();
  const db = getDb();
  const full = await db.company.findUniqueOrThrow({ where: { id: company.id } });
  const [wallet, targets, cashback, early, credits, usages] = await Promise.all([
    walletBalance(db, company.id),
    spendTargetProgress(db, full),
    rulesFor(db, full, "CASHBACK"),
    rulesFor(db, full, "EARLY_PAYMENT"),
    db.rebateCredit.findMany({ where: { companyId: actor.companyId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.rebateUsage.findMany({ where: { companyId: actor.companyId }, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, number: true } } } }),
  ]);
  const history = [
    ...credits.map((c) => ({ id: c.id, at: c.createdAt, text: c.description, amount: Number(c.amount), status: c.status, expiresAt: c.expiresAt, link: c.orderId ? `/portal/orders/${c.orderId}` : null })),
    ...usages.map((u) => ({ id: u.id, at: u.createdAt, text: u.description, amount: -Number(u.amount), status: "USED" as const, expiresAt: null, link: u.order ? `/portal/orders/${u.order.id}` : null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader title="Rebates" description="Rebates you earn go into your wallet. Use them at checkout to pay part or all of an order." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-sm text-ink-muted">Available to use</div>
            <div className="mt-1 text-3xl font-semibold text-brand-700">{formatCents(wallet.availableCents)}</div>
            {wallet.expiringSoonCents > 0 && (
              <div className="mt-1 text-xs text-amber-700">
                {formatCents(wallet.expiringSoonCents)} expires by {formatDate(wallet.nextExpiry)}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-ink-muted">Pending</div>
            <div className="mt-1 text-3xl font-semibold">{formatCents(wallet.pendingCents)}</div>
            <div className="mt-1 text-xs text-ink-muted">Becomes available once the order is paid / approved</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-ink-muted">Your programmes</div>
            <ul className="mt-1 space-y-0.5 text-sm">
              {[...cashback, ...early].map((r) => (
                <li key={r.id}>
                  {r.name}: {Number(r.percent)}%{r.type === "EARLY_PAYMENT" && ` if paid within ${r.earlyPaymentDays} days`}
                </li>
              ))}
              {targets.map((t) => (
                <li key={t.rule.id}>{t.rule.name}</li>
              ))}
              {cashback.length + early.length + targets.length === 0 && <li className="text-ink-muted">None yet. Ask your VITICO rep.</li>}
            </ul>
          </CardBody>
        </Card>
      </div>
      {targets.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Volume targets" />
          <CardBody>
            <TargetProgress items={targets} />
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="History" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Details</Th>
              <Th>Status</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && <EmptyRow colSpan={4}>No rebate activity yet.</EmptyRow>}
            {history.map((h) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap text-ink-muted">{formatDate(h.at)}</Td>
                <Td>
                  {h.link ? (
                    <Link href={h.link} className="hover:text-brand-700">
                      {h.text}
                    </Link>
                  ) : (
                    h.text
                  )}
                  {h.expiresAt && h.status === "AVAILABLE" && <div className="text-xs text-ink-muted">Expires {formatDate(h.expiresAt)}</div>}
                </Td>
                <Td>
                  <Badge tone={h.status === "AVAILABLE" ? "green" : h.status === "PENDING" ? "amber" : "neutral"}>{h.status.toLowerCase()}</Badge>
                </Td>
                <Td className={h.amount < 0 ? "text-right tabular-nums text-ink-muted" : "text-right font-medium tabular-nums"}>
                  {h.amount < 0 ? "−" : "+"}
                  {formatFJD(Math.abs(h.amount))}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
