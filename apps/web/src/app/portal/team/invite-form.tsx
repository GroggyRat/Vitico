"use client";

import { useActionState, useState } from "react";
import { CopyLink } from "@/components/ui/copy-link";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { inviteUserAction } from "../actions";

export function InviteForm() {
  const [state, action] = useActionState(inviteUserAction, undefined);
  const [role, setRole] = useState("PURCHASING");
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.ok && state.data?.link ? (
        <CopyLink label={state.message} value={state.data.link} />
      ) : (
        <FormMessage state={state} />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" htmlFor="invite-name" error={e.name}>
          <Input id="invite-name" name="name" required />
        </Field>
        <Field label="Email" htmlFor="invite-email" error={e.email}>
          <Input id="invite-email" name="email" type="email" required />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={e.role}>
          <Select id="invite-role" name="role" value={role} onChange={(ev) => setRole(ev.target.value)}>
            <option value="PURCHASING">Purchasing: places orders</option>
            <option value="ACCOUNTS">Accounts: invoices &amp; payments</option>
            <option value="OWNER">Owner: full access</option>
          </Select>
        </Field>
        {role === "PURCHASING" && (
          <Field label="Order approval limit (FJD)" htmlFor="invite-limit" error={e.orderLimit} hint="Orders above this need owner approval. Blank = no limit.">
            <Input id="invite-limit" name="orderLimit" type="number" min="0" step="0.01" inputMode="decimal" />
          </Field>
        )}
      </div>
      <SubmitButton pendingText="Inviting…">Send invite</SubmitButton>
    </form>
  );
}
