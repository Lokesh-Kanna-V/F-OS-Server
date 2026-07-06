import bcrypt from "bcryptjs";
import { prisma } from "@/db/client";
import { HttpError } from "@/shared/lib/http-error";
import { tokenService } from "@/shared/services/token.service";
import type { LoginInput, SignupInput } from "./auth.schema";
import type { SafeUser } from "./auth.types";

const SALT_ROUNDS = 10;

function toSafeUser(user: {
  id: string;
  name: string;
  email: string;
}): SafeUser {
  return { id: user.id, name: user.name, email: user.email };
}

export const authService = {
  signup: async (input: SignupInput) => {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new HttpError(409, "Email already in use");
    }

    const password = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, password },
    });

    const token = tokenService.sign({ sub: user.id, email: user.email });
    return { user: toSafeUser(user), token };
  },

  login: async (input: LoginInput) => {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.password);
    if (!valid) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = tokenService.sign({ sub: user.id, email: user.email });
    return { user: toSafeUser(user), token };
  },

  getById: async (id: string) => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new HttpError(401, "Invalid or expired session");
    }
    return toSafeUser(user);
  },
};
