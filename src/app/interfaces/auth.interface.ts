import { UserRole } from "../constants/user";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        emailVerified: boolean;
        isBanned: boolean;
        isActive: boolean;
        isDeleted: boolean;
      };
    }
  }
}

export interface AuthOptions {
  roles?: UserRole[];
  requireVerifiedEmail?: boolean;
}
