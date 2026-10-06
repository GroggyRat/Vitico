import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toBusinessInput } from "@/lib/time";
import { parseSteps } from "@/server/rebates/calc";
import { getRuleOptions } from "../options";
import { RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "Rebate programme" };

export default async function EditRulePage({ params }: PageProps<"/admin/rebates/[id]">) {
  await requireStaff("rebates.manage");
  const { id } = await params;
  const rule = await getDb().rebateRule.findUnique({ where: { id } });
  if (!rule) notFound();
  const options = await getRuleOptions();
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/rebates" className="text-ink-muted hover:text-ink">
          Back to Rebates
        </Link>
      </div>
      <PageHeader title={rule.name} />
      <Card>
        <CardBody>
          <RuleForm
            id={rule.id}
            {...options}
            values={{
              name: rule.name,
              description: rule.description ?? "",
              type: rule.type,
              active: rule.active,
              startsAt: toBusinessInput(rule.startsAt, true),
              endsAt: toBusinessInput(rule.endsAt, true),
              tierIds: rule.tierIds,
              companyId: rule.companyId ?? "",
              period: rule.period ?? "",
              percent: rule.percent?.toString() ?? "",
              steps: parseSteps(rule.steps),
              categoryIds: rule.categoryIds,
              skus: rule.skus.join(", "),
              earlyPaymentDays: rule.earlyPaymentDays?.toString() ?? "",
              expiryDays: rule.expiryDays?.toString() ?? "",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
