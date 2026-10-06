"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function NoteActionForm({ action, button, label, required, variant = "secondary" }: { action: Action; button: string; label: string; required?: boolean; variant?: "secondary" | "danger" | "primary" }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <details className="rounded-md border border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">{button}…</summary>
      <form action={run} className="mt-3 space-y-2">
        <FormMessage state={state} />
        <Field label={label} htmlFor={`note-${button}`} error={state?.errors?.reason ?? state?.errors?.note}>
          <Textarea id={`note-${button}`} name={required ? "reason" : "note"} required={required} className="min-h-16" />
        </Field>
        <SubmitButton size="sm" variant={variant}>
          {button}
        </SubmitButton>
      </form>
    </details>
  );
}

export function DispatchForm({ action, lines }: { action: Action; lines: { id: string; name: string; qty: number }[] }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-3">
      <FormMessage state={state} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-muted">
            <th className="text-left font-medium">Product</th>
            <th className="text-right font-medium">Ordered</th>
            <th className="text-right font-medium">Sent</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="py-1 pr-2">{l.name}</td>
              <td className="py-1 text-right tabular-nums">{l.qty}</td>
              <td className="py-1 pl-2 text-right">
                <Input name={`sent_${l.id}`} type="number" min={0} max={l.qty} defaultValue={l.qty} aria-label={`Units sent of ${l.name}`} className="ml-auto h-8 w-20 py-1 text-right" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Input name="note" placeholder="Vessel / truck / tracking (optional)" aria-label="Dispatch note" />
      <SubmitButton size="sm">Dispatch</SubmitButton>
    </form>
  );
}
