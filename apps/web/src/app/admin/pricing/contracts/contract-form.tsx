"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { addContractAction } from "../actions";

type Option = { id: string; label: string };

export function ContractForm({ companies, regions, defaultCompanyId }: { companies: Option[]; regions: Option[]; defaultCompanyId?: string }) {
  const [state, action] = useActionState(addContractAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Customer" htmlFor="ct-company" error={e.companyId}>
          <Select id="ct-company" name="companyId" defaultValue={defaultCompanyId ?? ""} required>
            <option value="" disabled>
              Choose…
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="SKU" htmlFor="ct-sku" error={e.sku}>
          <Input id="ct-sku" name="sku" required className="font-mono uppercase" />
        </Field>
        <Field label="Price (FJD, excl. VAT)" htmlFor="ct-price" error={e.price}>
          <Input id="ct-price" name="price" type="number" min="0" step="0.01" required />
        </Field>
        <Field label="Minimum quantity" htmlFor="ct-min" error={e.minQty}>
          <Input id="ct-min" name="minQty" type="number" min="1" step="1" defaultValue={1} />
        </Field>
        <Field label="Only for region" htmlFor="ct-region" error={e.regionId} hint="Region-specific prices skip the region uplift.">
          <Select id="ct-region" name="regionId" defaultValue="">
            <option value="">Any delivery region</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valid from" htmlFor="ct-from" error={e.validFrom}>
          <Input id="ct-from" name="validFrom" type="date" />
        </Field>
        <Field label="Valid to" htmlFor="ct-to" error={e.validTo}>
          <Input id="ct-to" name="validTo" type="date" />
        </Field>
        <Field label="Note" htmlFor="ct-note" error={e.note}>
          <Input id="ct-note" name="note" placeholder="e.g. 2026 supply agreement" />
        </Field>
      </div>
      <SubmitButton>Add contract price</SubmitButton>
    </form>
  );
}
