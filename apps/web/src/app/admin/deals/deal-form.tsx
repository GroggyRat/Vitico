"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveDealAction } from "./actions";

type Option = { id: string; label: string };

export type DealValues = {
  name: string;
  description: string;
  imageUrl: string;
  dealPrice: string;
  totalUnits: string;
  maxPerCustomer: string;
  bondPercent: string;
  completionDays: string;
  startsAt: string;
  endsAt: string;
  tierIds: string[];
  regionIds: string[];
  companyIds: string[];
  items: string;
};

function Checklist({ name, legend, options, selected }: { name: string; legend: string; options: Option[]; selected: string[] }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <p className="mb-2 text-xs text-ink-muted">Leave all unticked for everyone.</p>
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line p-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} className="accent-brand-600" /> {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DealForm({ id, values, tiers, regions, companies }: { id: string | null; values: DealValues; tiers: Option[]; regions: Option[]; companies: Option[] }) {
  const [state, action] = useActionState(saveDealAction.bind(null, id), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal name" htmlFor="d-name" error={e.name}>
          <Input id="d-name" name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Image URL (optional)" htmlFor="d-image" error={e.imageUrl}>
          <Input id="d-image" name="imageUrl" type="url" defaultValue={values.imageUrl} />
        </Field>
        <Field label="Description (optional)" htmlFor="d-desc" error={e.description} className="sm:col-span-2">
          <Textarea id="d-desc" name="description" defaultValue={values.description} className="min-h-16" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Products in one deal unit"
          htmlFor="d-items"
          error={e.items}
          hint="One per line: SKU, quantity. The deal price is split across them by their normal price."
        >
          <Textarea id="d-items" name="items" defaultValue={values.items} className="min-h-28 font-mono" placeholder={"OIL-SUN-4L, 1\nRIC-JAS-25, 2"} required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Deal price per unit (FJD excl. VAT)" htmlFor="d-price" error={e.dealPrice}>
            <Input id="d-price" name="dealPrice" type="number" min="0.01" step="0.01" defaultValue={values.dealPrice} required />
          </Field>
          <Field label="Units on offer" htmlFor="d-units" error={e.totalUnits}>
            <Input id="d-units" name="totalUnits" type="number" min="1" defaultValue={values.totalUnits} required />
          </Field>
          <Field label="Most units per customer" htmlFor="d-max" error={e.maxPerCustomer}>
            <Input id="d-max" name="maxPerCustomer" type="number" min="1" defaultValue={values.maxPerCustomer} required />
          </Field>
          <Field label="Bond %" htmlFor="d-bond" error={e.bondPercent} hint="Non-refundable, taken off the final invoice">
            <Input id="d-bond" name="bondPercent" type="number" min="0" max="100" step="0.01" defaultValue={values.bondPercent} required />
          </Field>
          <Field label="Days to complete after securing" htmlFor="d-days" error={e.completionDays}>
            <Input id="d-days" name="completionDays" type="number" min="1" max="90" defaultValue={values.completionDays} required />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts (Fiji time)" htmlFor="d-start" error={e.startsAt}>
          <Input id="d-start" name="startsAt" type="datetime-local" defaultValue={values.startsAt} required />
        </Field>
        <Field label="Ends (Fiji time)" htmlFor="d-end" error={e.endsAt}>
          <Input id="d-end" name="endsAt" type="datetime-local" defaultValue={values.endsAt} required />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Checklist name="tierIds" legend="Tiers" options={tiers} selected={values.tierIds} />
        <Checklist name="regionIds" legend="Regions" options={regions} selected={values.regionIds} />
        <Checklist name="companyIds" legend="Specific customers" options={companies} selected={values.companyIds} />
      </div>

      <SubmitButton>{id ? "Save draft" : "Create draft"}</SubmitButton>
    </form>
  );
}
