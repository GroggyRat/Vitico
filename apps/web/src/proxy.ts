import { type NextRequest, NextResponse } from "next/server";

// Must match SESSION_COOKIE in lib/auth/session.ts (that module is server-only).
const SESSION_COOKIE = "vitico_session";

/**
 * Optimistic check only: bounce visitors with no session cookie to /login.
 * Real authorization happens in the page/action guards (lib/auth/guards.ts).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
