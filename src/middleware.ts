import { NextResponse, type NextRequest } from "next/server";
import { redirectKeepingCookies, updateSession } from "@/lib/supabase/middleware";

/** Reachable without a session and without touching Supabase. */
const PUBLIC_EXACT = new Set(["/"]);
// /offer is the private patient offer link (the token is the credential). /api/webhooks authenticates by signature, not session. /pay is the development-only mock checkout. /chat and /api/chat are the patient-facing chat (anonymous; a per-conversation token authorizes it).
const PUBLIC_PREFIXES = ["/styleguide", "/api/webhooks", "/api/mcp", "/pay", "/chat", "/api/chat", "/offer"];
/** Sign-in pages: signed-in users are sent to the app instead. */
const AUTH_PAGES = new Set(["/login", "/signup", "/forgot-password"]);

/** Whole-segment match: "/pay" and "/pay/x" are public, "/payments" is not. */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  // Auth callbacks exchange a code for a session, so they must stay reachable.
  if (pathname.startsWith("/auth/")) return response;

  if (AUTH_PAGES.has(pathname)) {
    return user ? redirectKeepingCookies(request, response, "/dashboard") : response;
  }

  // Default deny: everything else needs a session.
  if (!user) {
    return redirectKeepingCookies(
      request,
      response,
      "/login",
      `?next=${encodeURIComponent(pathname)}`,
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
