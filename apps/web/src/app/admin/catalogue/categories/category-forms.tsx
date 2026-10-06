"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveCategoryAction } from "../actions";

type Option = { id: string; label: string };

export function CategoryRowForm({
  categoryId,
  name,
  parentId,
  sortOrder,
  active,
  parents,
}: {
  categoryId: string | null;
  name: string;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  parents: Option[];
}) {
  const [state, action] = useActionState(saveCategoryAction.bind(null, categoryId), undefined);
  const isNew = categoryId === null;
  return (
    <form action={action} className="space-y-2">
      {isNew && <FormMessage state={state} />}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name" htmlFor={`cat-name-${categoryId ?? "new"}`} error={isNew ? state?.errors?.name : undefined}>
          <Input id={`cat-name-${categoryId ?? "new"}`} name="name" defaultValue={name} required className="h-9 w-56" />
        </Field>
        <Field label="Parent" htmlFor={`cat-parent-${categoryId ?? "new"}`}>
          <Select id={`cat-parent-${categoryId ?? "new"}`} name="parentId" defaultValue={parentId ?? ""} className="h-9 w-56">
            <option value="">Top level</option>
            {parents
              .filter((p) => p.id !== categoryId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Order" htmlFor={`cat-sort-${categoryId ?? "new"}`}>
          <Input id={`cat-sort-${categoryId ?? "new"}`} name="sortOrder" type="number" min="0" defaultValue={sortOrder} className="h-9 w-20" />
        </Field>
        <label className="flex h-9 items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={active} className="accent-brand-600" /> Visible
        </label>
        <SubmitButton size="sm" variant={isNew ? "primary" : "secondary"} pendingText="…">
          {isNew ? "Add category" : "Save"}
        </SubmitButton>
        {!isNew && state?.message && <span className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"}>{state.message}</span>}
      </div>
    </form>
  );
}
