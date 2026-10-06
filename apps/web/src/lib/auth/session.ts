import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { IS_PRODUCTION } from "@/lib/env";
import { createSession, getSessionUser, revokeSession } from "@/server/services/auth";

export const SESSION_COOKIE = "vitico_session";

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(getDb(), token);
});

export async function startSession(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await createSession(getDb(), userId, {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(getDb(), token);
  store.delete(SESSION_COOKIE);
}
