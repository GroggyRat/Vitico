"use client";

import { useActionState, useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateUserAction } from "../actions";

export function MemberForm({ userId, role, orderLimit }: { userId: string; role: string; orderLimit: string | null }) {
  const [state, action] = useActionState(updateUserAction.bind(null, userId), undefined);
  const [current, setCurrent] = useState(role);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Select name="role" aria-label="Role" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-8 w-36 py-1">
        <option value="OWNER">Owner</option>
        <option value="PURCHASING">Purchasing</option>
        <option value="ACCOUNTS">Accounts</option>
      </Select>
      {current === "PURCHASING" && (
        <Input
          name="orderLimit"
          aria-label="Order approval limit (FJD)"
          placeholder="No limit"
          type="number"
          min="0"
          step="0.01"
          defaultValue={orderLimit ?? ""}
          className="h-8 w-32 py-1"
        />
      )}
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        Save
      </SubmitButton>
      {state?.message && (
        <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>
      )}
    </form>
  );
}
