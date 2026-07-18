import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // API calls go through Caddy's /api/* proxy under this same origin (see
  // docker/caddy/Caddyfile), so the auth cookie is genuinely scoped to this
  // host and visible here — unlike when dashboard/API were separate
  // hostnames, where this check could never see it.
  const hasSession = request.cookies.has("access_token");
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
