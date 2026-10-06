import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPricingConfig } from "@/server/services/pricing";
import { RulesForm } from "./rules-form";
import { PricingTabs } from "./tabs";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  await requireStaff("settings.pricing");
  const config = await getPricingConfig(getDb());
  return (
    <>
      <PageHeader title="Pricing" description="All prices are FJD excluding VAT. Tier discounts and region uplifts are under Tiers and Regions." />
      <PricingTabs />
      <Card>
        <CardBody>
          <RulesForm priority={config.priority} stack={config.stackTierAndQtyBreak} minMargin={config.minMarginPercent} />
        </CardBody>
      </Card>
    </>
  );
}
