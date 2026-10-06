"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateCompanyAction } from "../../actions";
import { AssignmentFields, type AssignmentValues } from "../../assignment-fields";
import type { AssignmentOptions } from "../../options";

export type CompanyFormValues = AssignmentValues & {
  name: string;
  tradingName: string | null;
  taxNumber: string | null;
  email: string;
  phone: string | null;
};

export function EditCompanyForm({
  companyId,
  options,
  values,
  canEdit,
  canCredit,
}: {
  companyId: string;
  options: AssignmentOptions;
  values: CompanyFormValues;
  canEdit: boolean;
  canCredit: boolean;
}) {
  const [state, action] = useActionState(updateCompanyAction.bind(null, companyId), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Registered name" htmlFor="c-name" error={e.name}>
          <Input id="c-name" name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Trading name" htmlFor="c-trading" error={e.tradingName}>
          <Input id="c-trading" name="tradingName" defaultValue={values.tradingName ?? ""} />
        </Field>
        <Field label="TIN / registration" htmlFor="c-tax" error={e.taxNumber}>
          <Input id="c-tax" name="taxNumber" defaultValue={values.taxNumber ?? ""} />
        </Field>
        <Field label="Email" htmlFor="c-email" error={e.email}>
          <Input id="c-email" name="email" type="email" defaultValue={values.email} required />
        </Field>
        <Field label="Phone" htmlFor="c-phone" error={e.phone}>
          <Input id="c-phone" name="phone" defaultValue={values.phone ?? ""} />
        </Field>
      </fieldset>
      {/* Disabled inputs aren't submitted, so pass read-only values through for validation. */}
      {!canEdit &&
        (["name", "tradingName", "taxNumber", "email", "phone", "tierId", "regionId", "salesRepId"] as const).map((k) => (
          <input key={k} type="hidden" name={k} value={values[k] ?? ""} />
        ))}
      {!canCredit &&
        (["creditLimit", "paymentTermsDays"] as const).map((k) => <input key={k} type="hidden" name={k} value={values[k]} />)}
      <AssignmentFields
        idPrefix="c"
        options={options}
        values={values}
        errors={e}
        assignmentDisabled={!canEdit}
        creditDisabled={!canCredit}
      />
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
