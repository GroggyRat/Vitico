import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDate, formatFJD } from "@/lib/format";
import { parseSteps } from "@/server/rebates/calc";
import { reviewCreditAction } from "./actions";

export const metadata: Metadata = { title: "Rebates" };

const typeLabel = { SPEND_TARGET: "Spend target", CASHBACK: "Cashback", EARLY_PAYMENT: "Early payment", CONTRACT: "Contract" };

export default async function RebatesAdminPage({ searchParams }: PageProps<"/admin/rebates">) {
  await requireStaff("rebates.manage");
  const { saved } = await searchParams;
  const db = getDb();
  const [rules, pending, liability] = await Promise.all([
    db.rebateRule.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { company: { select: { name: true } }, _count: { select: { credits: true } } } }),
    db.rebateCredit.findMany({ where: { status: "PENDING", rule: { type: "CONTRACT" } }, include: { company: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    db.rebateCredit.aggregate({ where: { status: { in: ["AVAILABLE", "PENDING"] } }, _sum: { remaining: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Rebates"
        description={`Outstanding rebate liability (available + pending): ${formatFJD(liability._sum.remaining ?? 0)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/settings/tiers" className={buttonClass("secondary")}>
              Tier suggestions
            </Link>
            <Link href="/admin/rebates/new" className={buttonClass()}>
              New programme
            </Link>
          </div>
        }
      />
      {saved && (
        <div className="mb-4">
          <FormMessage state={{ ok: true, message: "Programme saved." }} />
        </div>
      )}
      {pending.length > 0 && (
        <Card className="mb-6 border-amber-300">
          <CardHeader title="Contract rebates to approve" />
          <Table>
            <tbody>
              {pending.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/admin/companies/${c.company.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.company.name}
                    </Link>
                    <div className="text-xs text-ink-muted">{c.description}</div>
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{formatFJD(c.amount)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <ActionButton action={reviewCreditAction.bind(null, c.id, true)} variant="primary">
                        Approve
                      </ActionButton>
                      <ActionButton action={reviewCreditAction.bind(null, c.id, false)} variant="ghost" confirm="Reject this rebate? It won't be paid.">
                        Reject
                      </ActionButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Programme</Th>
              <Th>Type</Th>
              <Th>Terms</Th>
              <Th>When</Th>
              <Th className="text-right">Credits</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && <EmptyRow colSpan={6}>No rebate programmes yet.</EmptyRow>}
            {rules.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/rebates/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  {r.company && <div className="text-xs text-ink-muted">{r.company.name}</div>}
                </Td>
                <Td>{typeLabel[r.type]}</Td>
                <Td className="text-xs">
                  {r.type === "SPEND_TARGET"
                    ? parseSteps(r.steps)
                        .map((s) => `${formatFJD(s.threshold)}+: ${s.percent}%`)
                        .join(" · ")
                    : `${Number(r.percent)}%${r.type === "EARLY_PAYMENT" ? ` within ${r.earlyPaymentDays} days` : ""}`}
                  {r.period && <div className="text-ink-muted">per {r.period.toLowerCase()}</div>}
                </Td>
                <Td className="text-xs text-ink-muted">
                  {r.startsAt ? formatDate(r.startsAt) : "Now"} to {r.endsAt ? formatDate(r.endsAt) : "ongoing"}
                </Td>
                <Td className="text-right tabular-nums">{r._count.credits}</Td>
                <Td>
                  <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Active" : "Off"}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
