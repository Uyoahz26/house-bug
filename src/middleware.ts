import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateToken, verifyToken } from "@/lib/auth/jwt";

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function redirectToLogin(request: NextRequest, clearToken = false) {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);

  const response = NextResponse.redirect(loginUrl);
  if (clearToken) {
    response.cookies.set({
      name: "token",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const authPayload = await verifyToken(token);
    const refreshedToken = await generateToken(authPayload);

    const response = NextResponse.next();
    response.cookies.set({
      name: "token",
      value: refreshedToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return response;
  } catch {
    return redirectToLogin(request, true);
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/items/:path*",
    "/notifications/:path*",
    "/settings/:path*",
  ],
};
