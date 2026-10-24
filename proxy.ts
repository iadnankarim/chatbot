import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic check only: pages need a valid login cookie, otherwise go to /login.
// The API routes check the session again themselves (see getSessionUser).
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const onLoginPage = req.nextUrl.pathname === "/login";

  if (!session && !onLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (session && onLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Admin pages are for admins only (the admin APIs check the role again themselves).
  if (session && req.nextUrl.pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals and static files (logo, icon, fonts).
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico|woff2)$).*)"],
};
