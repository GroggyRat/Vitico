"use client";

import { useActionState } from "react";
import { CopyLink } from "@/components/ui/copy-link";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { staffRoleLabels } from "@/lib/auth/permissions";
import { inviteStaffAction, updateStaffAction } from "../actions";

const roles = Object.entries(staffRoleLabels);

export function InviteStaffForm() {
  const [state, action] = useActionState(inviteStaffAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.ok && state.data?.link ? <CopyLink label={state.message} value={state.data.link} /> : <FormMessage state={state} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="s-name" error={e.name}>
          <Input id="s-name" name="name" required />
        </Field>
        <Field label="Email" htmlFor="s-email" error={e.email}>
          <Input id="s-email" name="email" type="email" required />
        </Field>
        <Field label="Role" htmlFor="s-role" error={e.staffRole}>
          <Select id="s-role" name="staffRole" defaultValue="SALES_REP">
            {roles.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SubmitButton pendingText="Inviting…">Send invite</SubmitButton>
    </form>
  );
}

export function StaffRowForm({ userId, staffRole, active }: { userId: string; staffRole: string; active: boolean }) {
  const [state, action] = useActionState(updateStaffAction.bind(null, userId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Select name="staffRole" aria-label="Role" defaultValue={staffRole} className="h-8 w-44 py-1">
        {roles.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} className="accent-brand-600" /> Active
      </label>
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        Save
      </SubmitButton>
      {state?.message && <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>}
    </form>
  );
}
