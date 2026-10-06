import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { DealForm } from "../deal-form";
import { getDealOptions } from "../options";

export const metadata: Metadata = { title: "New Deal Drop" };

export default async function NewDealPage() {
  await requireStaff("deals.manage");
  const options = await getDealOptions();
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/deals" className="text-ink-muted hover:text-ink">
          Back to Deal Drops
        </Link>
      </div>
      <PageHeader title="New Deal Drop" description="Saved as a draft. Publishing sets the stock aside and tells customers when it starts." />
      <Card>
        <CardBody>
          <DealForm
            id={null}
            {...options}
            values={{ name: "", description: "", imageUrl: "", dealPrice: "", totalUnits: "", maxPerCustomer: "", bondPercent: "10", completionDays: "7", startsAt: "", endsAt: "", tierIds: [], regionIds: [], companyIds: [], items: "" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
