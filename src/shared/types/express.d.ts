import type { TokenPayload } from "@/shared/services/token.service";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};
