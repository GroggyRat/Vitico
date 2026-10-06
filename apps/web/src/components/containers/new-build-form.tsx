"use client";

import { useActionState } from "react";
import { createBuildAction } from "@/app/container-actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type Option = { id: string; label: string };

export function NewBuildForm({ types, regions, companies, defaultRegionId }: { types: Option[]; regions: Option[]; companies?: Option[]; defaultRegionId?: string }) {
  const [state, action] = useActionState(createBuildAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {companies && (
          <Field label="Customer" htmlFor="nb-company" error={e.companyId}>
            <Select id="nb-company" name="companyId" required defaultValue="">
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
        )}
        <Field label="Name" htmlFor="nb-name" error={e.name}>
          <Input id="nb-name" name="name" placeholder="e.g. November mixed load" required />
        </Field>
        <Field label="Container" htmlFor="nb-type" error={e.containerTypeId}>
          <Select id="nb-type" name="containerTypeId">
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destination" htmlFor="nb-dest" error={e.destinationRegionId}>
          <Select id="nb-dest" name="destinationRegionId" defaultValue={defaultRegionId}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SubmitButton pendingText="Creating…">Start building</SubmitButton>
    </form>
  );
}
