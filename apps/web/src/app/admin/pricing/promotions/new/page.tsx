import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getPromotionOptions } from "../options";
import { PromotionForm } from "../promotion-form";

export const metadata: Metadata = { title: "New promotion" };

export default async function NewPromotionPage() {
  await requireStaff("settings.pricing");
  const { tiers, regions } = await getPromotionOptions();
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/pricing/promotions" className="text-ink-muted hover:text-ink">
          Back to Promotions
        </Link>
      </div>
      <PageHeader title="New promotion" />
      <Card>
        <CardBody>
          <PromotionForm
            id={null}
            tiers={tiers}
            regions={regions}
            values={{ name: "", description: "", kind: "PERCENT_OFF", value: "", minQty: 1, startsAt: "", endsAt: "", active: true, skus: "", tierIds: [], regionIds: [] }}
          />
        </CardBody>
      </Card>
    </>
  );
}
