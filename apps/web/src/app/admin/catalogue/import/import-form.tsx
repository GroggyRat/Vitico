"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { importCsvAction } from "../actions";

export function ImportForm() {
  const [state, action] = useActionState(importCsvAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {state && !state.ok && state.errors && (
        <ul className="max-h-72 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.errors.map((e, i) => (
            <li key={i}>
              <span className="font-mono">Row {e.row}:</span> {e.message}
            </li>
          ))}
        </ul>
      )}
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        aria-label="CSV file"
        className="block text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm"
      />
      <SubmitButton pendingText="Importing…">Import</SubmitButton>
    </form>
  );
}
