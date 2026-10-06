import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const entries = await getDb().auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    include: { actor: { select: { name: true } } },
  });
  const hasMore = entries.length > PAGE_SIZE;

  return (
    <>
      <PageHeader title="Audit log" description="Every approval, permission and pricing-settings change." />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Record</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && <EmptyRow colSpan={5}>Nothing logged yet.</EmptyRow>}
            {entries.slice(0, PAGE_SIZE).map((e) => (
              <tr key={e.id} className="align-top">
                <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(e.createdAt)}</Td>
                <Td>{e.actor?.name ?? <span className="text-ink-muted">System / applicant</span>}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td className="text-xs">
                  {e.entityType === "Company" ? (
                    <Link href={`/admin/companies/${e.entityId}`} className="text-brand-700 hover:underline">
                      Company
                    </Link>
                  ) : (
                    e.entityType
                  )}
                </Td>
                <Td>
                  {e.data ? (
                    <pre className="max-w-md overflow-x-auto text-xs whitespace-pre-wrap text-ink-muted">{JSON.stringify(e.data, null, 1)}</pre>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link href={`/admin/audit?page=${page - 1}`} className="text-brand-700 hover:underline">← Newer</Link> : <span />}
        {hasMore && <Link href={`/admin/audit?page=${page + 1}`} className="text-brand-700 hover:underline">Older →</Link>}
      </div>
    </>
  );
}
