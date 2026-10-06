"use client";

import { useActionState, useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateRegionAction } from "../../actions";

export function RegionRowForm({ regionId, upliftType, upliftValue, active }: { regionId: string; upliftType: string; upliftValue: string; active: boolean }) {
  const [state, action] = useActionState(updateRegionAction.bind(null, regionId), undefined);
  const [type, setType] = useState(upliftType);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <Select name="upliftType" aria-label="Uplift type" value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-36 py-1">
        <option value="NONE">No uplift</option>
        <option value="PERCENT">% of price</option>
        <option value="FIXED">FJD per unit</option>
      </Select>
      <Input
        name="upliftValue"
        aria-label="Uplift value"
        type="number"
        min="0"
        step="0.01"
        defaultValue={upliftValue}
        disabled={type === "NONE"}
        className="h-8 w-24 py-1"
      />
      {type === "NONE" && <input type="hidden" name="upliftValue" value="0" />}
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} className="accent-brand-600" /> Active
      </label>
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        Save
      </SubmitButton>
      {state?.message && <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>}
    </form>
  );
}
