import { ServiceError } from "@/server/errors";
import type * as z from "zod";

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  /** One-time data to show after success, e.g. an invite link. */
  data?: Record<string, string>;
} | undefined;

export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function validationError(error: z.ZodError): ActionState {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (errors[key] ??= []).push(issue.message);
  }
  return { ok: false, errors, message: "Please fix the highlighted fields." };
}

/** Turns expected service errors into form state; rethrows anything unexpected. */
export function serviceErrorState(e: unknown): ActionState {
  if (e instanceof ServiceError) {
    return { ok: false, message: e.message, errors: e.field ? { [e.field]: [e.message] } : undefined };
  }
  throw e;
}
