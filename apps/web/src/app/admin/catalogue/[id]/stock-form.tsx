"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { adjustStockAction } from "../actions";

export function StockForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(adjustStockAction.bind(null, productId), undefined);
  const [type, setType] = useState("RECEIPT");
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="s-type">
          <Select id="s-type" name="type" value={type} onChange={(ev) => setType(ev.target.value)}>
            <option value="RECEIPT">Receive stock</option>
            <option value="ADJUSTMENT">Adjust (±)</option>
          </Select>
        </Field>
        <Field label="Units" htmlFor="s-qty" error={e.qty}>
          <Input id="s-qty" name="qty" type="number" step="1" min={type === "RECEIPT" ? 1 : undefined} required />
        </Field>
        <Field label="Reason" htmlFor="s-reason" error={e.reason} className="col-span-2">
          <Input id="s-reason" name="reason" required placeholder={type === "RECEIPT" ? "e.g. Container MSKU1234567" : "e.g. Stocktake, damaged"} />
        </Field>
      </div>
      <SubmitButton size="sm">Record</SubmitButton>
    </form>
  );
}
