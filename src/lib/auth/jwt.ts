import { SignJWT, jwtVerify } from "jose";
import { AuthTokenPayload } from "@/types/auth";

const TOKEN_EXPIRES_IN = "7d";

function getJwtSecret(): Uint8Array {
  const rawSecret = process.env.JWT_SECRET;

  if (!rawSecret || rawSecret.length < 32) {
    throw new Error("JWT_SECRET 未配置或长度不足（至少 32 位）。");
  }

  return new TextEncoder().encode(rawSecret);
}

export async function generateToken(
  payload: AuthTokenPayload,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRES_IN)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    (payload.role !== "admin" && payload.role !== "user")
  ) {
    throw new Error("无效的 token 载荷。");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}
