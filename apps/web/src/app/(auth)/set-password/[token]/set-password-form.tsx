"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { setPasswordAction } from "../../actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(setPasswordAction.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" error={state?.errors?.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={state?.errors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Saving…">
        Set password and sign in
      </SubmitButton>
    </form>
  );
}
