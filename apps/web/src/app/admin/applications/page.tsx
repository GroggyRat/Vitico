import type { Metadata } from "next";
import { CompanyStatus } from "@vitico/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getAssignmentOptions } from "../options";
import { ReviewForms } from "./review-forms";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: PageProps<"/admin/applications">) {
  await requireStaff("companies.approve");
  const { rejected } = await searchParams;
  const [applications, options] = await Promise.all([
    getDb().company.findMany({
      where: { status: CompanyStatus.PENDING },
      orderBy: { createdAt: "asc" },
      include: { region: true, users: true, addresses: { include: { region: true } } },
    }),
    getAssignmentOptions(),
  ]);

  return (
    <>
      <PageHeader title="Applications" description="New trade customers waiting for approval, oldest first." />
      {rejected && <FormMessage state={{ ok: true, message: "Application rejected." }} />}
      {applications.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-muted">No applications waiting. 🎉</CardBody>
        </Card>
      )}
      <div className="mt-4 space-y-6">
        {applications.map((c) => {
          const owner = c.users[0];
          const address = c.addresses[0];
          return (
            <Card key={c.id}>
              <CardHeader title={c.name} description={`Applied ${formatDateTime(c.createdAt)}`} />
              <CardBody className="grid gap-6 lg:grid-cols-3">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-ink-muted">Contact</dt>
                    <dd>
                      {owner?.name} · {owner?.email}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Business</dt>
                    <dd>
                      {c.tradingName && <div>Trading as {c.tradingName}</div>}
                      <div>TIN {c.taxNumber}</div>
                      <div>
                        {c.email} · {c.phone}
                      </div>
                    </dd>
                  </div>
                  {address && (
                    <div>
                      <dt className="text-ink-muted">Address</dt>
                      <dd>{[address.line1, address.line2, address.city, address.region.name].filter(Boolean).join(", ")}</dd>
                    </div>
                  )}
                  {c.applicationNotes && (
                    <div>
                      <dt className="text-ink-muted">Notes</dt>
                      <dd className="whitespace-pre-line">{c.applicationNotes}</dd>
                    </div>
                  )}
                </dl>
                <div className="lg:col-span-2">
                  <ReviewForms
                    companyId={c.id}
                    options={options}
                    values={{ tierId: c.tierId, regionId: c.regionId, creditLimit: "0", paymentTermsDays: 0, salesRepId: null }}
                  />
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
