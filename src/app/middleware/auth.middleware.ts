import { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth as betterAuth } from "../lib/auth";

export enum UserRole {
  CUSTOMER = "CUSTOMER",
  SELLER = "SELLER",
  ADMIN = "ADMIN",
}

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
      };
    }
  }
}

interface AuthOptions {
  roles?: UserRole[];
  requireVerifiedEmail?: boolean;
}

const isValidUserRole = (role: any): role is UserRole => {
  return (
    role === UserRole.CUSTOMER ||
    role === UserRole.SELLER ||
    role === UserRole.ADMIN
  );
};

const auth = (options: AuthOptions = {}) => {
  const { roles = [], requireVerifiedEmail = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await betterAuth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session) {
        throw Object.assign(new Error("Unauthorized. Please login."), {
          statusCode: 401,
        });
      }

      const userRole = session.user.role;
      if (!isValidUserRole(userRole)) {
        throw Object.assign(new Error("Invalid user role in session."), {
          statusCode: 401,
        });
      }

      if (session.user.isBanned) {
        throw Object.assign(
          new Error("Your account is banned. Access denied."),
          { statusCode: 403 }
        );
      }

      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: userRole,
        emailVerified: session.user.emailVerified,
        isBanned: session.user.isBanned,
      };

      if (requireVerifiedEmail && !req.user.emailVerified) {
        throw Object.assign(
          new Error("Email verification required. Please check your inbox."),
          { statusCode: 403 }
        );
      }

      if (roles.length && !roles.includes(userRole)) {
        throw Object.assign(new Error("Forbidden. Insufficient permissions."), {
          statusCode: 403,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;
