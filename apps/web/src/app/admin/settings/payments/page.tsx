import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPaymentSettings } from "@/server/services/payment-settings";
import { PaymentSettingsForm } from "./payment-settings-form";

export const metadata: Metadata = { title: "Payment details" };

export default async function PaymentSettingsPage() {
  await requireStaff("settings.payments");
  const values = await getPaymentSettings(getDb());
  return (
    <>
      <PageHeader title="Payment details" description="Shown to customers paying by bank deposit, M-PAiSA or MyCash." />
      <Card>
        <CardBody>
          <PaymentSettingsForm values={values} />
        </CardBody>
      </Card>
    </>
  );
}
