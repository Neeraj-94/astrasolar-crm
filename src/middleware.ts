import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "__astra_session";

/**
 * Lightweight gate: anything inside /(dashboard) or at "/" requires a session
 * cookie. The cookie's contents are verified by `getCurrentUser()` in server
 * components, where full permission checks happen.
 *
 * The Edge runtime can't run firebase-admin, so we deliberately don't try to
 * verify the cookie's signature here — we only check presence and let the
 * server-side guards do the heavy lifting.
 */
const PUBLIC_PATHS = ["/login", "/api/auth/session", "/api/health"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets/") ||
    pathname === "/manifest.json"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
