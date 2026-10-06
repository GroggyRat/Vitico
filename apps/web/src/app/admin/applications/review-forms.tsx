"use client";

import { useActionState } from "react";
import { Field, FormMessage, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { approveCompanyAction, rejectCompanyAction } from "../actions";
import { AssignmentFields, type AssignmentValues } from "../assignment-fields";
import type { AssignmentOptions } from "../options";

export function ReviewForms({ companyId, options, values }: { companyId: string; options: AssignmentOptions; values: AssignmentValues }) {
  const [approveState, approve] = useActionState(approveCompanyAction.bind(null, companyId), undefined);
  const [rejectState, reject] = useActionState(rejectCompanyAction.bind(null, companyId), undefined);

  return (
    <div className="space-y-6">
      <form action={approve} className="space-y-4">
        <FormMessage state={approveState} />
        <AssignmentFields idPrefix={`approve-${companyId}`} options={options} values={values} errors={approveState?.errors} />
        <SubmitButton pendingText="Approving…">Approve account</SubmitButton>
      </form>
      <details className="rounded-md border border-line p-4">
        <summary className="cursor-pointer text-sm font-medium text-red-700">Reject application…</summary>
        <form action={reject} className="mt-4 space-y-3">
          <FormMessage state={rejectState} />
          <Field label="Reason" htmlFor={`reject-${companyId}`} error={rejectState?.errors?.reason}>
            <Textarea id={`reject-${companyId}`} name="reason" required />
          </Field>
          <SubmitButton variant="danger" pendingText="Rejecting…">
            Reject
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
