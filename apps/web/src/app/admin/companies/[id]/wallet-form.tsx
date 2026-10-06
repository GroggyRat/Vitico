"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function WalletAdjustForm({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-2">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Adjust by (FJD, negative to remove)" htmlFor="w-amount" error={state?.errors?.amount}>
          <Input id="w-amount" name="amount" type="number" step="0.01" className="w-40" required />
        </Field>
        <Field label="Reason" htmlFor="w-reason" error={state?.errors?.reason} className="min-w-64 flex-1">
          <Input id="w-reason" name="reason" required />
        </Field>
        <SubmitButton variant="secondary">Adjust</SubmitButton>
      </div>
    </form>
  );
}
