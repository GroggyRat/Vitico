import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { odooConfigFromEnv } from "@/server/odoo/client";
import { pullNowAction, pushNowAction, retryFailedAction, syncAllCustomersAction, testOdooAction } from "./actions";

export const metadata: Metadata = { title: "Odoo" };

const kindLabel = { PARTNER_PUSH: "Customer to Odoo", ORDER_PUSH: "Order to Odoo", ORDER_CANCEL: "Cancel in Odoo" };

export default async function OdooPage() {
  await requireStaff("integrations.manage");
  const cfg = odooConfigFromEnv();
  const db = getDb();
  const [counts, recent, linked, lastPull] = await Promise.all([
    db.odooSyncTask.groupBy({ by: ["status"], _count: true }),
    db.odooSyncTask.findMany({ where: { status: { in: ["FAILED", "PENDING", "RUNNING"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.company.count({ where: { odooPartnerId: { not: null } } }),
    db.appSetting.findUnique({ where: { key: "job:odoo-pull" } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const lastPullAt = (lastPull?.value as { lastRun?: string } | null)?.lastRun;

  return (
    <>
      <PageHeader title="Odoo integration" description="Customers and confirmed orders go to Odoo; invoices, payments and balances come back every 15 minutes." />
      <Card className="mb-6">
        <CardHeader title="Connection" actions={cfg ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>} />
        <CardBody className="space-y-4 text-sm">
          {cfg ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              <dt className="text-ink-muted">URL</dt>
              <dd>{cfg.url}</dd>
              <dt className="text-ink-muted">Database</dt>
              <dd>{cfg.db}</dd>
              <dt className="text-ink-muted">API</dt>
              <dd>{cfg.protocol === "json2" ? "JSON-2 (Odoo 19+)" : `JSON-RPC as ${cfg.username}`}</dd>
              <dt className="text-ink-muted">Customers linked</dt>
              <dd>{linked}</dd>
              <dt className="text-ink-muted">Last accounting pull</dt>
              <dd>{lastPullAt ? formatDateTime(new Date(lastPullAt)) : "Not yet"}</dd>
            </dl>
          ) : (
            <p className="text-ink-muted">
              Set <code>ODOO_URL</code>, <code>ODOO_DB</code> and <code>ODOO_API_KEY</code> (see <code>.env.example</code>) and restart the app and worker. Until then the
              portal works on its own and available credit is calculated from portal orders.
            </p>
          )}
          {cfg && (
            <div className="flex flex-wrap gap-2">
              <ActionButton action={testOdooAction}>Test connection</ActionButton>
              <ActionButton action={syncAllCustomersAction}>Send all customers</ActionButton>
              <ActionButton action={pushNowAction}>Send queued changes now</ActionButton>
              <ActionButton action={pullNowAction}>Pull invoices now</ActionButton>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sync queue"
          description={`${count("PENDING") + count("RUNNING")} waiting · ${count("DONE")} done · ${count("FAILED")} failed`}
          actions={count("FAILED") > 0 ? <ActionButton action={retryFailedAction}>Retry failed</ActionButton> : undefined}
        />
        <Table>
          <thead>
            <tr>
              <Th>Change</Th>
              <Th>Record</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>Last error</Th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && <EmptyRow colSpan={5}>Nothing waiting or failed.</EmptyRow>}
            {recent.map((t) => (
              <tr key={t.id} className="align-top">
                <Td>
                  {kindLabel[t.kind]}
                  <div className="text-xs text-ink-muted">{formatDateTime(t.createdAt)}</div>
                </Td>
                <Td className="text-xs">
                  <Link href={t.kind === "PARTNER_PUSH" ? `/admin/companies/${t.entityId}` : `/admin/orders/${t.entityId}`} className="text-brand-700 hover:underline">
                    Open
                  </Link>
                </Td>
                <Td>
                  <Badge tone={t.status === "FAILED" ? "red" : "amber"}>{t.status.toLowerCase()}</Badge>
                  {t.status === "PENDING" && t.attempts > 0 && <div className="text-xs text-ink-muted">retry {formatDateTime(t.runAfter)}</div>}
                </Td>
                <Td className="tabular-nums">{t.attempts}</Td>
                <Td className="max-w-md text-xs break-words text-red-700">{t.lastError}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
