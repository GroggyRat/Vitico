"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { RegionOption } from "@/lib/regions";
import { signupAction } from "../actions";

export function SignupForm({ regions }: { regions: RegionOption[] }) {
  const [state, action] = useActionState(signupAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Business details</legend>
        <Field label="Registered business name" htmlFor="companyName" error={e.companyName}>
          <Input id="companyName" name="companyName" required autoComplete="organization" />
        </Field>
        <Field label="Trading name (if different)" htmlFor="tradingName" error={e.tradingName}>
          <Input id="tradingName" name="tradingName" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="TIN / registration no." htmlFor="taxNumber" error={e.taxNumber}>
            <Input id="taxNumber" name="taxNumber" required />
          </Field>
          <Field label="Business phone" htmlFor="phone" error={e.phone}>
            <Input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="+679 …" />
          </Field>
        </div>
        <Field label="Business email (for invoices)" htmlFor="companyEmail" error={e.companyEmail}>
          <Input id="companyEmail" name="companyEmail" type="email" required />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Delivery address</legend>
        <Field label="Region" htmlFor="regionId" error={e.regionId}>
          <Select id="regionId" name="regionId" required defaultValue="">
            <option value="" disabled>
              Choose a region…
            </option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Street address" htmlFor="addressLine1" error={e.addressLine1}>
          <Input id="addressLine1" name="addressLine1" required autoComplete="address-line1" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 2" htmlFor="addressLine2" error={e.addressLine2}>
            <Input id="addressLine2" name="addressLine2" autoComplete="address-line2" />
          </Field>
          <Field label="Town / city" htmlFor="city" error={e.city}>
            <Input id="city" name="city" required autoComplete="address-level2" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Your login</legend>
        <Field label="Your name" htmlFor="name" error={e.name}>
          <Input id="name" name="name" required autoComplete="name" />
        </Field>
        <Field label="Your email" htmlFor="email" error={e.email}>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password" error={e.password} hint="At least 10 characters, with a letter and a number.">
          <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={10} />
        </Field>
      </fieldset>

      <Field label="Anything else we should know? (optional)" htmlFor="notes" error={e.notes}>
        <Textarea id="notes" name="notes" placeholder="e.g. type of business, products you're interested in" />
      </Field>

      <SubmitButton className="w-full" pendingText="Submitting…">
        Submit application
      </SubmitButton>
    </form>
  );
}
