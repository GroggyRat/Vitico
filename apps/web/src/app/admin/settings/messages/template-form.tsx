"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function TemplateForm({ type, subject, body, action }: { type: string; subject: string; body: string; action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-2">
      <FormMessage state={state} />
      <Field label="Subject" htmlFor={`t-${type}-s`} error={state?.errors?.subject}>
        <Input id={`t-${type}-s`} name="subject" defaultValue={subject} />
      </Field>
      <Field label="Message" htmlFor={`t-${type}-b`} error={state?.errors?.body}>
        <Textarea id={`t-${type}-b`} name="body" defaultValue={body} className="min-h-24" />
      </Field>
      <SubmitButton size="sm" variant="secondary">
        Save
      </SubmitButton>
    </form>
  );
}
