import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getRuleOptions } from "../options";
import { RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "New rebate programme" };

export default async function NewRulePage() {
  await requireStaff("rebates.manage");
  const options = await getRuleOptions();
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/rebates" className="text-ink-muted hover:text-ink">
          Back to Rebates
        </Link>
      </div>
      <PageHeader title="New rebate programme" />
      <Card>
        <CardBody>
          <RuleForm
            id={null}
            {...options}
            values={{ name: "", description: "", type: "SPEND_TARGET", active: true, startsAt: "", endsAt: "", tierIds: [], companyId: "", period: "QUARTER", percent: "", steps: [], categoryIds: [], skus: "", earlyPaymentDays: "", expiryDays: "" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
