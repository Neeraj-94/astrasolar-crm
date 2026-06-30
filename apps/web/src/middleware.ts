import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight gate: anything inside /(dashboard) or at "/" requires a JWT
 * session cookie issued by the NestJS API. The token's signature + permissions
 * are verified server-side (getCurrentUser -> /auth/me); here we only check for
 * the presence of a token and let the server guards do the heavy lifting.
 *
 * A valid session has either a live access_token or a refresh_token (the API
 * client transparently refreshes the access token from the refresh token).
 */
const PUBLIC_PATHS = ["/login", "/api/v1", "/api/health"];

// Static assets served from /public (logo, icons, manifest, etc.). Any request
// whose final path segment has one of these extensions is a static file and
// must never be redirected to /login — otherwise the <img>/next-image fetch on
// the unauthenticated login page resolves to login HTML and the asset breaks.
const STATIC_FILE = /\.(png|jpe?g|gif|svg|webp|ico|webmanifest|json|txt|xml|woff2?|ttf)$/i;

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets/") ||
    STATIC_FILE.test(pathname)
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession =
    !!req.cookies.get("access_token")?.value ||
    !!req.cookies.get("refresh_token")?.value;

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
