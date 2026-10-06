"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveContainerTypeAction } from "./actions";

type Values = { code: string; name: string; maxCbm: string; maxWeightKg: string; sortOrder: number; active: boolean; allowedRegionIds: string[] };

export function ContainerTypeForm({ id, values, regions }: { id: string | null; values: Values; regions: { id: string; label: string }[] }) {
  const [state, action] = useActionState(saveContainerTypeAction.bind(null, id), undefined);
  const e = state?.errors ?? {};
  const k = id ?? "new";
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Code" htmlFor={`ct-code-${k}`} error={e.code}>
          <Input id={`ct-code-${k}`} name="code" defaultValue={values.code} required className="uppercase" />
        </Field>
        <Field label="Name" htmlFor={`ct-name-${k}`} error={e.name} className="sm:col-span-2">
          <Input id={`ct-name-${k}`} name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Usable m³" htmlFor={`ct-cbm-${k}`} error={e.maxCbm}>
          <Input id={`ct-cbm-${k}`} name="maxCbm" type="number" step="0.01" min="0" defaultValue={values.maxCbm} required />
        </Field>
        <Field label="Max payload kg" htmlFor={`ct-kg-${k}`} error={e.maxWeightKg}>
          <Input id={`ct-kg-${k}`} name="maxWeightKg" type="number" step="1" min="0" defaultValue={values.maxWeightKg} required />
        </Field>
        <Field label="Order" htmlFor={`ct-sort-${k}`}>
          <Input id={`ct-sort-${k}`} name="sortOrder" type="number" min="0" defaultValue={values.sortOrder} />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-ink-muted">Only ship to… ({values.allowedRegionIds.length || "anywhere"})</summary>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {regions.map((r) => (
            <label key={r.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="allowedRegionIds" value={r.id} defaultChecked={values.allowedRegionIds.includes(r.id)} className="accent-brand-600" /> {r.label}
            </label>
          ))}
        </div>
      </details>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={values.active} className="accent-brand-600" /> Available
        </label>
        <SubmitButton size="sm" variant={id ? "secondary" : "primary"}>
          {id ? "Save" : "Add container type"}
        </SubmitButton>
      </div>
    </form>
  );
}
