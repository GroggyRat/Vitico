"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { RegionOption } from "@/lib/regions";
import { addAddressAction } from "../actions";

export function AddressForm({ regions }: { regions: RegionOption[] }) {
  const [state, action] = useActionState(addAddressAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="addr-label" error={e.label}>
          <Input id="addr-label" name="label" placeholder="e.g. Suva branch" required />
        </Field>
        <Field label="Region" htmlFor="addr-region" error={e.regionId}>
          <Select id="addr-region" name="regionId" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Street address" htmlFor="addr-line1" error={e.line1}>
          <Input id="addr-line1" name="line1" required />
        </Field>
        <Field label="Address line 2" htmlFor="addr-line2" error={e.line2}>
          <Input id="addr-line2" name="line2" />
        </Field>
        <Field label="Town / city" htmlFor="addr-city" error={e.city}>
          <Input id="addr-city" name="city" required />
        </Field>
      </div>
      <SubmitButton pendingText="Adding…">Add address</SubmitButton>
    </form>
  );
}
