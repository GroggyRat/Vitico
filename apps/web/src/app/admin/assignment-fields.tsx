import { Field, Input, Select } from "@/components/ui/form";
import type { AssignmentOptions } from "./options";

export type AssignmentValues = {
  tierId: string;
  regionId: string;
  creditLimit: string;
  paymentTermsDays: number;
  salesRepId: string | null;
};

/** Tier, region, credit and sales-rep fields shared by the approve and edit forms. */
export function AssignmentFields({
  idPrefix,
  options,
  values,
  errors = {},
  creditDisabled,
  assignmentDisabled,
}: {
  idPrefix: string;
  options: AssignmentOptions;
  values: AssignmentValues;
  errors?: Record<string, string[] | undefined>;
  creditDisabled?: boolean;
  assignmentDisabled?: boolean;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Tier" htmlFor={id("tier")} error={errors.tierId}>
        <Select id={id("tier")} name="tierId" defaultValue={values.tierId} disabled={assignmentDisabled}>
          {options.tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Pricing region" htmlFor={id("region")} error={errors.regionId}>
        <Select id={id("region")} name="regionId" defaultValue={values.regionId} disabled={assignmentDisabled}>
          {options.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sales rep" htmlFor={id("rep")} error={errors.salesRepId}>
        <Select id={id("rep")} name="salesRepId" defaultValue={values.salesRepId ?? ""} disabled={assignmentDisabled}>
          <option value="">Unassigned</option>
          {options.reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Credit limit (FJD)" htmlFor={id("credit")} error={errors.creditLimit} hint="0 = no credit; must pay before dispatch.">
        <Input
          id={id("credit")}
          name="creditLimit"
          type="number"
          min="0"
          step="0.01"
          defaultValue={values.creditLimit}
          disabled={creditDisabled}
        />
      </Field>
      <Field label="Payment terms (days)" htmlFor={id("terms")} error={errors.paymentTermsDays}>
        <Select id={id("terms")} name="paymentTermsDays" defaultValue={String(values.paymentTermsDays)} disabled={creditDisabled}>
          {[0, 7, 14, 30, 45, 60].map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "Pay before dispatch" : `Net ${d}`}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
