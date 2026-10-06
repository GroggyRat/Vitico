"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateTierAction } from "../../actions";

export function TierRowForm({ tierId, name, discountPercent, minAnnualSpend }: { tierId: string; name: string; discountPercent: string; minAnnualSpend: string }) {
  const [state, action] = useActionState(updateTierAction.bind(null, tierId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input name="name" aria-label="Tier name" defaultValue={name} className="h-8 w-40 py-1" required />
      <div className="flex items-center gap-1">
        <Input
          name="discountPercent"
          aria-label="Default discount %"
          type="number"
          min="0"
          max="100"
          step="0.01"
          defaultValue={discountPercent}
          className="h-8 w-24 py-1"
        />
        <span className="text-sm text-ink-muted">% off base</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm text-ink-muted">from</span>
        <Input
          name="minAnnualSpend"
          aria-label="Suggested from 12-month spend (FJD)"
          type="number"
          min="0"
          step="1"
          defaultValue={minAnnualSpend}
          placeholder="-"
          className="h-8 w-32 py-1"
        />
        <span className="text-sm text-ink-muted">/ year</span>
      </div>
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        Save
      </SubmitButton>
      {state?.message && <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>}
    </form>
  );
}
