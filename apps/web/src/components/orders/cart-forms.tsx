"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function QtyForm({ action, qty, moq, multiple }: { action: Action; qty: number; moq: number; multiple: number }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Input name="qty" type="number" min={0} step={multiple} defaultValue={qty} aria-label="Quantity" className="h-8 w-20 py-1 text-right" />
        <SubmitButton size="sm" variant="secondary" pendingText="…">
          Update
        </SubmitButton>
      </div>
      {state?.message && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
      {moq > 1 && <span className="text-xs text-ink-muted">min {moq}</span>}
    </form>
  );
}

export function DetailsForm({
  action,
  addresses,
  values,
}: {
  action: Action;
  addresses: { id: string; label: string }[];
  values: { delivery: string; poNumber: string; notes: string; requestedDate: string };
}) {
  const [state, run] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={run} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Deliver to" htmlFor="cart-delivery" error={e.delivery ?? e.addressId}>
        <Select id="cart-delivery" name="delivery" defaultValue={values.delivery}>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
          <option value="pickup">Pickup from VITICO warehouse</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PO number" htmlFor="cart-po" error={e.poNumber}>
          <Input id="cart-po" name="poNumber" defaultValue={values.poNumber} />
        </Field>
        <Field label="Requested date" htmlFor="cart-date" error={e.requestedDate}>
          <Input id="cart-date" name="requestedDate" type="date" defaultValue={values.requestedDate} />
        </Field>
      </div>
      <Field label="Delivery instructions" htmlFor="cart-notes" error={e.notes}>
        <Textarea id="cart-notes" name="notes" defaultValue={values.notes} className="min-h-16" />
      </Field>
      <SubmitButton size="sm" variant="secondary">
        Save &amp; update prices
      </SubmitButton>
    </form>
  );
}

export function CheckoutForm({
  action,
  methods,
  disabledReason,
}: {
  action: Action;
  methods: { value: string; label: string; hint?: string; disabled?: boolean }[];
  disabledReason: string | null;
}) {
  const [state, run] = useActionState(action, undefined);
  const firstEnabled = methods.find((m) => !m.disabled)?.value;
  return (
    <form action={run} className="space-y-4">
      <FormMessage state={state} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Payment</legend>
        {methods.map((m) => (
          <label key={m.value} className={`flex items-start gap-2 rounded-md border border-line p-3 text-sm ${m.disabled ? "opacity-60" : "cursor-pointer hover:bg-canvas"}`}>
            <input type="radio" name="paymentMethod" value={m.value} defaultChecked={m.value === firstEnabled} disabled={m.disabled} className="mt-0.5 accent-brand-600" />
            <span>
              <span className="font-medium">{m.label}</span>
              {m.hint && <span className="block text-xs text-ink-muted">{m.hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      {disabledReason && <p className="text-sm text-red-600">{disabledReason}</p>}
      <SubmitButton className="w-full" disabled={!!disabledReason} pendingText="Placing order…">
        Place order
      </SubmitButton>
    </form>
  );
}

export function SaveListForm({ action }: { action: Action }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      <Input name="name" placeholder="List name, e.g. Weekly order" aria-label="List name" className="h-8 max-w-56 py-1" />
      <SubmitButton size="sm" variant="secondary">
        Save cart as list
      </SubmitButton>
      {state?.message && <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>}
    </form>
  );
}

export function AddSkuForm({ action }: { action: Action }) {
  const [state, run] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={run} className="space-y-2">
      <FormMessage state={state?.ok ? undefined : state} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="SKU" htmlFor="add-sku" error={e.sku}>
          <Input id="add-sku" name="sku" required className="w-40 font-mono uppercase" />
        </Field>
        <Field label="Qty" htmlFor="add-qty" error={e.qty}>
          <Input id="add-qty" name="qty" type="number" min="1" defaultValue={1} className="w-24" />
        </Field>
        <SubmitButton pendingText="Adding…">Add</SubmitButton>
      </div>
    </form>
  );
}

export function OverrideForm({ action, price, reason }: { action: Action; price: string; reason: string }) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="mt-2 flex flex-wrap items-center gap-1.5">
      <Input name="price" type="number" min="0" step="0.01" defaultValue={price} placeholder="Manual price" aria-label="Manual unit price" className="h-8 w-28 py-1" />
      <Input name="reason" defaultValue={reason} placeholder="Reason (required)" aria-label="Reason for manual price" className="h-8 w-48 py-1" />
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        {price ? "Update" : "Set price"}
      </SubmitButton>
      {state?.message && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </form>
  );
}
