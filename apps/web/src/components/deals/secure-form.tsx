"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Choose units and how to pay the bond. Shows the value and bond as the units change. */
export function SecureDealForm({
  action,
  maxUnits,
  unitTotalCents,
  bondPercent,
  walletCents,
}: {
  action: Action;
  maxUnits: number;
  unitTotalCents: number;
  bondPercent: number;
  walletCents: number;
}) {
  const [state, run] = useActionState(action, undefined);
  const [units, setUnits] = useState(1);
  const [method, setMethod] = useState(walletCents > 0 ? "REBATE_WALLET" : "BANK_DEPOSIT");
  const e = state?.errors ?? {};
  const value = unitTotalCents * (Number.isInteger(units) && units > 0 ? units : 0);
  const bond = Math.round((value * bondPercent) / 100);
  const fmt = (c: number) => `FJD ${(c / 100).toFixed(2)}`;
  return (
    <form action={run} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Deal units (up to ${maxUnits})`} htmlFor="s-units" error={e.units}>
          <Input id="s-units" name="units" type="number" min={1} max={maxUnits} value={units} onChange={(ev) => setUnits(Number(ev.target.value))} required />
        </Field>
        <Field label="Pay the bond by" htmlFor="s-method" error={e.method}>
          <Select id="s-method" name="method" value={method} onChange={(ev) => setMethod(ev.target.value)}>
            <option value="REBATE_WALLET" disabled={walletCents < bond}>
              Rebate wallet ({fmt(walletCents)} available)
            </option>
            <option value="BANK_DEPOSIT">Bank deposit / transfer</option>
            <option value="MPAISA">M-PAiSA</option>
            <option value="MYCASH">MyCash</option>
          </Select>
        </Field>
      </div>
      {method !== "REBATE_WALLET" && (
        <Field label="Payment reference" htmlFor="s-ref" error={e.reference} hint="Bank receipt number or M-PAiSA / MyCash transaction ID">
          <Input id="s-ref" name="reference" required />
        </Field>
      )}
      <dl className="space-y-1 rounded-md bg-canvas px-4 py-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Deal value incl. VAT</dt>
          <dd className="tabular-nums">{fmt(value)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Bond now ({bondPercent}%, non-refundable)</dt>
          <dd className="tabular-nums">{fmt(bond)}</dd>
        </div>
        <div className="flex justify-between text-ink-muted">
          <dt>Left to pay when you complete</dt>
          <dd className="tabular-nums">{fmt(value - bond)}</dd>
        </div>
      </dl>
      <SubmitButton>Secure units</SubmitButton>
    </form>
  );
}
