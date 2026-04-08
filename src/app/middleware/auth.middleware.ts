import { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth as betterAuth } from "../lib/auth";
import status from "http-status";

import { UserRole, USER_ROLES } from "../constants/user";
import AppError from "../error/AppError";

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
  return USER_ROLES.includes(role);
};

const auth = (options: AuthOptions = {}) => {
  const { roles = [], requireVerifiedEmail = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await betterAuth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session) {
        throw new AppError(status.UNAUTHORIZED, "Unauthorized. Please login.");
      }

      const userRole = session.user.role;
      if (!isValidUserRole(userRole)) {
        throw new AppError(status.UNAUTHORIZED, "Invalid user role in session.");
      }

      if (session.user.isBanned) {
        throw new AppError(
          status.FORBIDDEN,
          "Your account is banned. Access denied."
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
        throw new AppError(
          status.FORBIDDEN,
          "Email verification required. Please check your inbox."
        );
      }

      if (roles.length && !roles.includes(userRole)) {
        throw new AppError(
          status.FORBIDDEN,
          "Forbidden. Insufficient permissions."
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;
