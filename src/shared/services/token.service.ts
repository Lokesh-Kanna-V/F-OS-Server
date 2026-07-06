import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "@/shared/config/env";

export type TokenPayload = {
  sub: string;
  email: string;
};

export const tokenService = {
  sign: (payload: TokenPayload) =>
    jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    }),

  verify: (token: string) => jwt.verify(token, env.JWT_SECRET) as TokenPayload,
};
