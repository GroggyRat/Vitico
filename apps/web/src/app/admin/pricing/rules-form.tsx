"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { savePricingConfigAction } from "./actions";

const labels = {
  CONTRACT: "Contract price (per customer)",
  PROMOTION: "Promotion / Deal",
  TIER: "Tier price",
  QTY_BREAK: "Quantity break",
} as const;

export function RulesForm({ priority, stack, minMargin }: { priority: string[]; stack: boolean; minMargin: number }) {
  const [state, action] = useActionState(savePricingConfigAction, undefined);
  const order = priority.filter((p) => p !== "BASE");
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <div>
        <h3 className="text-sm font-semibold">Priority</h3>
        <p className="mb-3 text-sm text-ink-muted">
          For each product the first source that applies sets the price; the standard base price is the fallback. The region uplift is then added.
        </p>
        <ol className="space-y-2">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex items-center gap-3">
              <span className="w-6 text-right text-sm font-medium text-ink-muted">{n}.</span>
              <Select name={`priority${n}`} defaultValue={order[n - 1]} aria-label={`Priority ${n}`} className="max-w-xs">
                {Object.entries(labels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </li>
          ))}
          <li className="flex items-center gap-3 text-sm text-ink-muted">
            <span className="w-6 text-right font-medium">5.</span> Base price (always last)
          </li>
        </ol>
        {state?.errors?.priority1 && <p className="mt-2 text-sm text-red-600">{state.errors.priority1[0]}</p>}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="stackTierAndQtyBreak" defaultChecked={stack} className="mt-0.5 accent-brand-600" />
        <span>
          <span className="font-medium">Combine tier and bulk discounts</span>
          <span className="block text-ink-muted">When the tier price wins, also apply a percentage quantity break on top (e.g. VIP 5% then 3% bulk).</span>
        </span>
      </label>
      <Field label="Minimum margin for manual prices (%)" htmlFor="margin" hint="Manual price overrides below cost + this margin are flagged for approval." className="max-w-xs">
        <Input id="margin" name="minMarginPercent" type="number" min="0" max="100" step="0.1" defaultValue={minMargin} />
      </Field>
      <SubmitButton>Save rules</SubmitButton>
    </form>
  );
}
