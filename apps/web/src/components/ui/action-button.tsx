"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Button, type ButtonProps } from "./button";
import { CopyLink } from "./copy-link";

/** A one-click server action (already bound to its arguments) with inline feedback. */
export function ActionButton({
  action,
  confirm,
  children,
  ...props
}: Omit<ButtonProps, "action"> & {
  action: (state: ActionState) => Promise<ActionState>;
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <Button type="submit" size="sm" variant="secondary" disabled={pending} {...props}>
        {children}
      </Button>
      {state?.message && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
      {state?.ok && state.data?.link && <CopyLink label={state.message} value={state.data.link} />}
    </form>
  );
}
