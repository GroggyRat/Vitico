"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { addFcccAction, addQuantityBreakAction, setTierPricesAction } from "../../pricing/actions";

export function TierPricesForm({
  productId,
  tiers,
}: {
  productId: string;
  tiers: { id: string; name: string; discountPercent: number; defaultPrice: string; price: string }[];
}) {
  const [state, action] = useActionState(
    setTierPricesAction.bind(null, productId, tiers.map((t) => t.id)),
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <table className="w-full text-sm">
        <tbody>
          {tiers.map((t) => (
            <tr key={t.id}>
              <td className="py-1 pr-3">{t.name}</td>
              <td className="py-1">
                <Input
                  name={`tier_${t.id}`}
                  aria-label={`${t.name} price`}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={t.price}
                  placeholder={`${t.defaultPrice} (−${t.discountPercent}%)`}
                  className="h-8 py-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-muted">Leave blank to use the tier&apos;s default discount.</p>
      <SubmitButton size="sm" variant="secondary">
        Save tier prices
      </SubmitButton>
    </form>
  );
}

export function QuantityBreakForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(addQuantityBreakAction.bind(null, productId), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-2">
      <FormMessage state={state} />
      <div className="grid grid-cols-3 gap-2">
        <Field label="From qty" htmlFor="qb-min" error={e.minQty}>
          <Input id="qb-min" name="minQty" type="number" min="2" step="1" required className="h-9" />
        </Field>
        <Field label="Type" htmlFor="qb-kind">
          <Select id="qb-kind" name="kind" className="h-9">
            <option value="PERCENT_OFF">% off</option>
            <option value="FIXED_PRICE">Price</option>
          </Select>
        </Field>
        <Field label="Value" htmlFor="qb-value" error={e.value}>
          <Input id="qb-value" name="value" type="number" min="0" step="0.01" required className="h-9" />
        </Field>
      </div>
      <SubmitButton size="sm" variant="secondary">
        Add break
      </SubmitButton>
    </form>
  );
}

export function FcccForm({ productId, regions }: { productId: string; regions: { id: string; label: string }[] }) {
  const [state, action] = useActionState(addFcccAction.bind(null, productId), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="FCCC price (FJD)" htmlFor="fc-price" error={e.price}>
          <Input id="fc-price" name="price" type="number" min="0" step="0.01" required className="h-9" />
        </Field>
        <Field label="Per" htmlFor="fc-basis">
          <Select id="fc-basis" name="basis" className="h-9">
            <option value="PER_ITEM">Item</option>
            <option value="PER_SELL_UNIT">Sell unit</option>
          </Select>
        </Field>
        <Field label="Effective from" htmlFor="fc-from" error={e.effectiveFrom}>
          <Input id="fc-from" name="effectiveFrom" type="date" required className="h-9" />
        </Field>
        <Field label="Expires" htmlFor="fc-to" error={e.expiresAt}>
          <Input id="fc-to" name="expiresAt" type="date" className="h-9" />
        </Field>
        <Field label="Region" htmlFor="fc-region">
          <Select id="fc-region" name="regionId" className="h-9">
            <option value="">All Fiji</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="fc-ref" error={e.reference}>
          <Input id="fc-ref" name="reference" placeholder="Gazette / order no." className="h-9" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="vatInclusive" defaultChecked className="accent-brand-600" /> Price includes VAT
      </label>
      <SubmitButton size="sm" variant="secondary">
        Add FCCC price
      </SubmitButton>
    </form>
  );
}
