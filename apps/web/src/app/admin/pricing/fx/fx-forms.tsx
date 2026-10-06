"use client";

import { useActionState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { refreshRatesAction, setExchangeRateAction } from "../actions";

export function RateForm({ currency, perFjd }: { currency: string; perFjd: string }) {
  const [state, action] = useActionState(setExchangeRateAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="currency" value={currency} />
      <span className="text-sm text-ink-muted">1 FJD =</span>
      <Input name="perFjd" aria-label={`${currency} per FJD`} type="number" min="0" step="0.000001" defaultValue={perFjd} className="h-8 w-32 py-1" required />
      <span className="text-sm">{currency}</span>
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        Save
      </SubmitButton>
      {state?.message && <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>}
    </form>
  );
}

export function RefreshButton() {
  return <ActionButton action={refreshRatesAction}>Refresh from rate service</ActionButton>;
}

