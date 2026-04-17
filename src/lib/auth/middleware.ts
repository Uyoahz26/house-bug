import { verifyToken } from "@/lib/auth/jwt";
import { AuthTokenPayload } from "@/types/auth";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

function extractCookieValue(cookieHeader: string, key: string): string | null {
  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [cookieKey, ...cookieValueParts] = cookie.trim().split("=");
    if (cookieKey === key) {
      return cookieValueParts.join("=");
    }
  }

  return null;
}

export async function withAuth(request: Request): Promise<AuthTokenPayload> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = extractCookieValue(cookieHeader, "token");

  if (!token) {
    throw new AuthError("Missing token");
  }

  try {
    return await verifyToken(token);
  } catch {
    throw new AuthError("Invalid token");
  }
}
