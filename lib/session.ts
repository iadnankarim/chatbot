// Login cookie: a signed JWT (HS256). Safe to import from proxy.ts (no Next-only APIs).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "plpa_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // one working day

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  department: string;
  role: "admin" | "user";
};

const secretKey = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of 32+ characters");
  }
  return new TextEncoder().encode(secret);
};

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Turn on once the app is served over HTTPS (COOKIE_SECURE=true).
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

export async function signSession(user: SessionUser) {
  return new SignJWT({
    username: user.username,
    name: user.name,
    department: user.department,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    return {
      id: Number(payload.sub),
      username: String(payload.username),
      name: String(payload.name),
      department: String(payload.department),
      role: payload.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null; // expired, tampered or malformed
  }
}
