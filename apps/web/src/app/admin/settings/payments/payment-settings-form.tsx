"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PaymentSettings } from "@/server/services/payment-settings";
import { savePaymentSettingsAction } from "../../orders/actions";

const fields: [keyof PaymentSettings, string][] = [
  ["bankName", "Bank"],
  ["accountName", "Account name"],
  ["accountNumber", "Account number"],
  ["branch", "Branch"],
  ["swift", "SWIFT / BIC (for overseas customers)"],
  ["mpaisaNumber", "M-PAiSA merchant number"],
  ["mycashNumber", "MyCash merchant number"],
];

export function PaymentSettingsForm({ values }: { values: PaymentSettings }) {
  const [state, action] = useActionState(savePaymentSettingsAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`ps-${k}`}>
            <Input id={`ps-${k}`} name={k} defaultValue={values[k]} />
          </Field>
        ))}
      </div>
      <Field label="Extra instructions" htmlFor="ps-note" hint="e.g. Always use your order number as the payment reference.">
        <Textarea id="ps-note" name="note" defaultValue={values.note} />
      </Field>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
