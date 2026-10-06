"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type Option = { id: string; label: string };

export function BuildDetailsForm({
  action,
  types,
  regions,
  addresses,
  values,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  types: Option[];
  regions: Option[];
  addresses: Option[];
  values: { name: string; containerTypeId: string; destinationRegionId: string; addressId: string; poNumber: string; notes: string; requestedDate: string };
}) {
  const [state, run] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={run} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Name" htmlFor="cb-name" error={e.name}>
        <Input id="cb-name" name="name" defaultValue={values.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Container" htmlFor="cb-type" error={e.containerTypeId}>
          <Select id="cb-type" name="containerTypeId" defaultValue={values.containerTypeId}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destination" htmlFor="cb-dest" error={e.destinationRegionId}>
          <Select id="cb-dest" name="destinationRegionId" defaultValue={values.destinationRegionId}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Deliver to" htmlFor="cb-addr" error={e.addressId}>
        <Select id="cb-addr" name="addressId" defaultValue={values.addressId}>
          <option value="">Port of discharge (customer collects)</option>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PO number" htmlFor="cb-po" error={e.poNumber}>
          <Input id="cb-po" name="poNumber" defaultValue={values.poNumber} />
        </Field>
        <Field label="Wanted by" htmlFor="cb-date" error={e.requestedDate}>
          <Input id="cb-date" name="requestedDate" type="date" defaultValue={values.requestedDate} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="cb-notes" error={e.notes}>
        <Textarea id="cb-notes" name="notes" defaultValue={values.notes} className="min-h-16" />
      </Field>
      <SubmitButton size="sm" variant="secondary">
        Save details
      </SubmitButton>
    </form>
  );
}
