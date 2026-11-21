import type { UserDocument } from "@/models/user-model";

declare global {
  namespace Express {
    interface User extends UserDocument {
      _id?: any;
    }
    interface Request {
      /** The Better Auth session for this request (set by attachSession) */
      authSession?: {
        id: string;
        token: string;
        userId: string;
        expiresAt: Date;
        ipAddress?: string | null;
        userAgent?: string | null;
      };
    }
  }
}
