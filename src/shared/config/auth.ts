import type { CookieOptions } from "express";
import { env } from "@/shared/config/env";

export const AUTH_COOKIE_NAME = "f_os_token";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: SEVEN_DAYS_MS,
};
