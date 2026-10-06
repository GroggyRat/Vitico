"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddToCart({
  action,
  moq,
  multiple,
  disabled,
  compact,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  moq: number;
  multiple: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2">
        <Input
          name="qty"
          type="number"
          min={moq}
          step={multiple}
          defaultValue={moq}
          aria-label="Quantity"
          className={compact ? "h-9 w-20 py-1" : "w-24"}
          disabled={disabled}
        />
        <SubmitButton size={compact ? "sm" : "md"} className={compact ? "h-9 flex-1" : "flex-1"} disabled={disabled} pendingText="Adding…">
          {disabled ? "Out of stock" : "Add to cart"}
        </SubmitButton>
      </div>
      {state?.message && (
        <p className={state.ok ? "text-xs text-brand-700" : "text-xs text-red-600"} role={state.ok ? "status" : "alert"}>
          {state.message}
          {state.ok && (
            <>
              {" · "}
              <Link href="/portal/cart" className="font-medium underline">
                View cart
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
