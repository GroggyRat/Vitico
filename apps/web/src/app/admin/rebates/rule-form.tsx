"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveRuleAction } from "./actions";

type Option = { id: string; label: string };

export type RuleValues = {
  name: string;
  description: string;
  type: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
  tierIds: string[];
  companyId: string;
  period: string;
  percent: string;
  steps: { threshold: number; percent: number }[];
  categoryIds: string[];
  skus: string;
  earlyPaymentDays: string;
  expiryDays: string;
};

const typeHelp: Record<string, string> = {
  SPEND_TARGET: "Customers who spend past a threshold in a period earn a % of that period's spend, paid into their wallet when the period ends.",
  CASHBACK: "Earn a % on eligible products when an order is completed; available once the order is paid.",
  EARLY_PAYMENT: "Credit-account customers earn a % of the order when they pay within the window after dispatch.",
  CONTRACT: "One customer earns a % of spend per period. Each settlement waits for an admin to approve it.",
};

export function RuleForm({ id, values, tiers, companies, categories }: { id: string | null; values: RuleValues; tiers: Option[]; companies: Option[]; categories: Option[] }) {
  const [state, action] = useActionState(saveRuleAction.bind(null, id), undefined);
  const [type, setType] = useState(values.type);
  const e = state?.errors ?? {};
  const steps = [...values.steps, ...Array.from({ length: Math.max(0, 4 - values.steps.length) }, () => ({ threshold: 0, percent: 0 }))];
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Programme name (customers see this)" htmlFor="r-name" error={e.name} className="sm:col-span-2">
          <Input id="r-name" name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Type" htmlFor="r-type" error={e.type}>
          <Select id="r-type" name="type" value={type} onChange={(ev) => setType(ev.target.value)}>
            <option value="SPEND_TARGET">Spend target</option>
            <option value="CASHBACK">Product / category cashback</option>
            <option value="EARLY_PAYMENT">Early payment</option>
            <option value="CONTRACT">Annual / contract</option>
          </Select>
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={values.active} className="accent-brand-600" /> Active
          </label>
        </div>
      </div>
      <p className="rounded-md bg-canvas px-3 py-2 text-sm text-ink-muted">{typeHelp[type]}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(type === "SPEND_TARGET" || type === "CONTRACT") && (
          <Field label="Period" htmlFor="r-period" error={e.period}>
            <Select id="r-period" name="period" defaultValue={values.period || "QUARTER"}>
              <option value="MONTH">Monthly</option>
              <option value="QUARTER">Quarterly</option>
              <option value="YEAR">Yearly</option>
            </Select>
          </Field>
        )}
        {type !== "SPEND_TARGET" && (
          <Field label="Rebate %" htmlFor="r-pct" error={e.percent}>
            <Input id="r-pct" name="percent" type="number" min="0" max="100" step="0.01" defaultValue={values.percent} required />
          </Field>
        )}
        {type === "EARLY_PAYMENT" && (
          <Field label="Paid within (days of dispatch)" htmlFor="r-days" error={e.earlyPaymentDays}>
            <Input id="r-days" name="earlyPaymentDays" type="number" min="0" defaultValue={values.earlyPaymentDays} required />
          </Field>
        )}
        {type === "CONTRACT" && (
          <Field label="Customer" htmlFor="r-company" error={e.companyId}>
            <Select id="r-company" name="companyId" defaultValue={values.companyId} required>
              <option value="">Choose…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Credit expires after (days)" htmlFor="r-exp" error={e.expiryDays} hint="Blank = never expires">
          <Input id="r-exp" name="expiryDays" type="number" min="1" defaultValue={values.expiryDays} />
        </Field>
        <Field label="Starts" htmlFor="r-start" error={e.startsAt}>
          <Input id="r-start" name="startsAt" type="date" defaultValue={values.startsAt} />
        </Field>
        <Field label="Ends" htmlFor="r-end" error={e.endsAt}>
          <Input id="r-end" name="endsAt" type="date" defaultValue={values.endsAt} />
        </Field>
      </div>

      {type === "SPEND_TARGET" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Steps (spend in the period, FJD excl. VAT, and the % back on all of it)</legend>
          {e.steps && <p className="mb-2 text-sm text-red-600">{e.steps[0]}</p>}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-16 text-ink-muted">Step {i + 1}</span>
                <Input name="stepThreshold" type="number" min="0" step="1" defaultValue={s.threshold || ""} placeholder="e.g. 10000" aria-label={`Step ${i + 1} spend`} className="w-36" />
                <span>gives</span>
                <Input name="stepPercent" type="number" min="0" max="100" step="0.01" defaultValue={s.percent || ""} placeholder="%" aria-label={`Step ${i + 1} percent`} className="w-24" />
                <span className="text-ink-muted">%</span>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {type === "CASHBACK" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Categories (none = all products)</legend>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={values.categoryIds.includes(c.id)} className="accent-brand-600" /> {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="…or specific SKUs" htmlFor="r-skus" error={e.skus}>
            <Input id="r-skus" name="skus" defaultValue={values.skus} className="font-mono uppercase" placeholder="RIC-JAS-25, OIL-VEG-4X5" />
          </Field>
        </div>
      )}

      {type !== "CONTRACT" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tiers (none ticked = all)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {tiers.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="tierIds" value={t.id} defaultChecked={values.tierIds.includes(t.id)} className="accent-brand-600" /> {t.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field label="Internal notes" htmlFor="r-desc" error={e.description}>
        <Input id="r-desc" name="description" defaultValue={values.description} />
      </Field>
      <SubmitButton>{id ? "Save programme" : "Create programme"}</SubmitButton>
    </form>
  );
}
