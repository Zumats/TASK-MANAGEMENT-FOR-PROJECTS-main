import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";

export type JwtUser = {
  id: number;
  email: string;
  role: "admin" | "manager" | "user";
  department: string;
};

const COOKIE_NAME = "tm_token";

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "dev_insecure_jwt_secret_change_me";
  throw new Error("JWT_SECRET is not set");
}

export function signToken(user: JwtUser): string {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtUser {
  return jwt.verify(token, getJwtSecret()) as JwtUser;
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  return cookie || null;
}

export function getUserFromRequest(req: NextRequest): JwtUser | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function cookieName(): string {
  return COOKIE_NAME;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
