"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email" error={state?.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <SubmitButton className="w-full" pendingText="Sending…">
        Email me a reset link
      </SubmitButton>
    </form>
  );
}
