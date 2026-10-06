"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { savePromotionAction } from "../actions";

type Option = { id: string; label: string };

export type PromotionValues = {
  name: string;
  description: string;
  kind: string;
  value: string;
  minQty: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  skus: string;
  tierIds: string[];
  regionIds: string[];
};

export function PromotionForm({ id, values, tiers, regions }: { id: string | null; values: PromotionValues; tiers: Option[]; regions: Option[] }) {
  const [state, action] = useActionState(savePromotionAction.bind(null, id), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name (shown to customers)" htmlFor="pr-name" error={e.name} className="sm:col-span-2">
          <Input id="pr-name" name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Discount type" htmlFor="pr-kind" error={e.kind}>
          <Select id="pr-kind" name="kind" defaultValue={values.kind}>
            <option value="PERCENT_OFF">% off base price</option>
            <option value="FIXED_PRICE">Fixed unit price (FJD)</option>
          </Select>
        </Field>
        <Field label="Value" htmlFor="pr-value" error={e.value}>
          <Input id="pr-value" name="value" type="number" min="0" step="0.01" defaultValue={values.value} required />
        </Field>
        <Field label="Starts" htmlFor="pr-start" error={e.startsAt}>
          <Input id="pr-start" name="startsAt" type="datetime-local" defaultValue={values.startsAt} />
        </Field>
        <Field label="Ends" htmlFor="pr-end" error={e.endsAt}>
          <Input id="pr-end" name="endsAt" type="datetime-local" defaultValue={values.endsAt} />
        </Field>
        <Field label="Minimum quantity" htmlFor="pr-min" error={e.minQty}>
          <Input id="pr-min" name="minQty" type="number" min="1" step="1" defaultValue={values.minQty} />
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={values.active} className="accent-brand-600" /> Active
          </label>
        </div>
        <Field label="Description (internal)" htmlFor="pr-desc" error={e.description} className="sm:col-span-2 lg:col-span-4">
          <Input id="pr-desc" name="description" defaultValue={values.description} />
        </Field>
        <Field label="Products (SKUs)" htmlFor="pr-skus" error={e.skus} hint="Separate with commas, spaces or new lines." className="sm:col-span-2 lg:col-span-4">
          <Textarea id="pr-skus" name="skus" defaultValue={values.skus} className="font-mono uppercase" required />
        </Field>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tiers (none ticked = all)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {tiers.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="tierIds" value={t.id} defaultChecked={values.tierIds.includes(t.id)} className="accent-brand-600" /> {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Regions (none ticked = all)</legend>
          <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">
            {regions.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="regionIds" value={r.id} defaultChecked={values.regionIds.includes(r.id)} className="accent-brand-600" /> {r.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <SubmitButton>{id ? "Save promotion" : "Create promotion"}</SubmitButton>
    </form>
  );
}
