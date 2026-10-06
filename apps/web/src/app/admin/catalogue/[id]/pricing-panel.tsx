import { toCents, applyAdjustment } from "@vitico/pricing";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { formatCents, formatDate, formatFJD } from "@/lib/format";
import { getRegionOptions } from "@/lib/regions";
import { deleteFcccAction, deleteQuantityBreakAction } from "../../pricing/actions";
import { FcccForm, QuantityBreakForm, TierPricesForm } from "./pricing-forms";

/** Tier prices, quantity breaks and FCCC references for one product. */
export async function PricingPanel({ productId, basePrice, canEdit }: { productId: string; basePrice: number; canEdit: boolean }) {
  const db = getDb();
  const [tiers, tierPrices, breaks, fccc, regions] = await Promise.all([
    db.tier.findMany({ orderBy: { sortOrder: "asc" } }),
    db.tierPrice.findMany({ where: { productId } }),
    db.quantityBreak.findMany({ where: { productId }, orderBy: { minQty: "asc" } }),
    db.fcccPrice.findMany({ where: { productId }, orderBy: { effectiveFrom: "desc" }, include: { region: true } }),
    canEdit ? getRegionOptions() : Promise.resolve([]),
  ]);
  const baseCents = toCents(basePrice);
  const now = new Date();

  return (
    <Card>
      <CardHeader title="Pricing" description="Contract prices and promotions are under Pricing." />
      <CardBody className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Tier prices</h3>
          {canEdit ? (
            <TierPricesForm
              productId={productId}
              tiers={tiers.map((t) => ({
                id: t.id,
                name: t.name,
                discountPercent: Number(t.discountPercent),
                defaultPrice: (applyAdjustment(baseCents, { kind: "PERCENT_OFF", value: Number(t.discountPercent) }) / 100).toFixed(2),
                price: tierPrices.find((p) => p.tierId === t.id)?.price.toString() ?? "",
              }))}
            />
          ) : (
            <ul className="text-sm">
              {tiers.map((t) => {
                const tp = tierPrices.find((p) => p.tierId === t.id);
                return (
                  <li key={t.id}>
                    {t.name}: {tp ? formatFJD(tp.price) : `${Number(t.discountPercent)}% off`}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Quantity breaks</h3>
          {breaks.length === 0 ? (
            <p className="mb-2 text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="mb-3 divide-y divide-line rounded-md border border-line text-sm">
              {breaks.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-3 py-1.5">
                  <span>
                    {b.minQty}+ units: {b.kind === "PERCENT_OFF" ? `${Number(b.value)}% off (${formatCents(applyAdjustment(baseCents, { kind: "PERCENT_OFF", value: Number(b.value) }))})` : formatFJD(b.value)}
                  </span>
                  {canEdit && (
                    <ActionButton action={deleteQuantityBreakAction.bind(null, b.id)} variant="ghost">
                      Remove
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && <QuantityBreakForm productId={productId} />}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">FCCC reference prices</h3>
          {fccc.length === 0 ? (
            <p className="mb-2 text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="mb-3 divide-y divide-line rounded-md border border-line text-sm">
              {fccc.map((f) => {
                const live = f.effectiveFrom <= now && (!f.expiresAt || f.expiresAt > now);
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span>
                      {formatFJD(f.price)} per {f.basis === "PER_ITEM" ? "item" : "unit"}
                      {f.vatInclusive ? " incl. VAT" : ""} · {f.region?.name ?? "All Fiji"}
                      <span className="block text-xs text-ink-muted">
                        {live ? "Current" : f.effectiveFrom > now ? "Upcoming" : "Expired"} · from {formatDate(f.effectiveFrom)}
                        {f.expiresAt && ` to ${formatDate(f.expiresAt)}`}
                        {f.reference && ` · ${f.reference}`}
                      </span>
                    </span>
                    {canEdit && (
                      <ActionButton action={deleteFcccAction.bind(null, f.id)} variant="ghost">
                        Remove
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canEdit && <FcccForm productId={productId} regions={regions} />}
        </section>
      </CardBody>
    </Card>
  );
}
