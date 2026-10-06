import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPromotionOptions, toLocalInput } from "../options";
import { PromotionForm } from "../promotion-form";

export const metadata: Metadata = { title: "Edit promotion" };

export default async function EditPromotionPage({ params }: PageProps<"/admin/pricing/promotions/[id]">) {
  await requireStaff("settings.pricing");
  const { id } = await params;
  const promo = await getDb().promotion.findUnique({ where: { id }, include: { products: { include: { product: { select: { sku: true } } } } } });
  if (!promo) notFound();
  const { tiers, regions } = await getPromotionOptions();
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/pricing/promotions" className="text-ink-muted hover:text-ink">
          ← Promotions
        </Link>
      </div>
      <PageHeader title={promo.name} />
      <Card>
        <CardBody>
          <PromotionForm
            id={promo.id}
            tiers={tiers}
            regions={regions}
            values={{
              name: promo.name,
              description: promo.description ?? "",
              kind: promo.kind,
              value: promo.value.toString(),
              minQty: promo.minQty,
              startsAt: toLocalInput(promo.startsAt),
              endsAt: toLocalInput(promo.endsAt),
              active: promo.active,
              skus: promo.products.map((p) => p.product.sku).join(", "),
              tierIds: promo.tierIds,
              regionIds: promo.regionIds,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
