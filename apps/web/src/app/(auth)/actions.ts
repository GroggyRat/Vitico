"use server";

import { redirect } from "next/navigation";
import { type ActionState, formToObject, serviceErrorState, validationError } from "@/lib/actions";
import { endSession, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { acceptInviteSchema, forgotPasswordSchema, loginSchema, signupSchema } from "@/lib/validation";
import { LOCKOUT_MINUTES, authenticate } from "@/server/services/auth";
import { applyForAccount } from "@/server/services/signup";
import { redeemToken, requestPasswordReset } from "@/server/services/users";

const loginMessages = {
  invalid: "Incorrect email or password.",
  locked: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
  pending: "Your account application is still being reviewed by VITICO. We'll email you once it's approved.",
  disabled: "This account is disabled. Contact VITICO if you think this is a mistake.",
};

/** Only allow same-site relative redirects after login. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);

  const result = await authenticate(getDb(), parsed.data.email, parsed.data.password);
  if (!result.ok) return { ok: false, message: loginMessages[result.reason] };

  await startSession(result.userId);
  redirect(safeNext(formData.get("next")?.toString()));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function signupAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await applyForAccount(getDb(), parsed.data);
  } catch (e) {
    return serviceErrorState(e);
  }
  redirect("/signup/submitted");
}

export async function setPasswordAction(token: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = acceptInviteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  let userId: string;
  try {
    userId = await redeemToken(getDb(), token, parsed.data.password);
  } catch (e) {
    return serviceErrorState(e);
  }
  await startSession(userId);
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  await requestPasswordReset(getDb(), parsed.data.email);
  // Same answer whether or not the account exists.
  return { ok: true, message: "If that email has an account, we've sent a link to reset the password. Check your inbox (and spam)." };
}
