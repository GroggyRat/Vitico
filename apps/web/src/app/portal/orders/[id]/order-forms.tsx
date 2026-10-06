"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ReasonForm({ action, label, button, variant = "danger" }: { action: Action; label: string; button: string; variant?: "danger" | "secondary" }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <details className="rounded-md border border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">{button}…</summary>
      <form action={run} className="mt-3 space-y-2">
        <FormMessage state={state} />
        <Field label={label} htmlFor={`reason-${button}`} error={state?.errors?.reason}>
          <Textarea id={`reason-${button}`} name="reason" required className="min-h-16" />
        </Field>
        <SubmitButton size="sm" variant={variant}>
          {button}
        </SubmitButton>
      </form>
    </details>
  );
}

export function PaymentForm({ action, defaultMethod, amount }: { action: Action; defaultMethod: string; amount: string }) {
  const [state, run] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={run} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Paid by" htmlFor="pay-method" error={e.method}>
          <Select id="pay-method" name="method" defaultValue={defaultMethod}>
            <option value="BANK_DEPOSIT">Bank deposit / transfer</option>
            <option value="MPAISA">M-PAiSA</option>
            <option value="MYCASH">MyCash</option>
          </Select>
        </Field>
        <Field label="Amount (FJD)" htmlFor="pay-amount" error={e.amount}>
          <Input id="pay-amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={amount} required />
        </Field>
        <Field label="Transaction / receipt ref." htmlFor="pay-ref" error={e.reference}>
          <Input id="pay-ref" name="reference" required />
        </Field>
      </div>
      <Field label="Receipt photo or PDF (optional)" htmlFor="pay-proof" error={e.proof} hint="JPG, PNG, WebP or PDF up to 5 MB">
        <input id="pay-proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      </Field>
      <SubmitButton size="sm">Submit payment details</SubmitButton>
    </form>
  );
}
