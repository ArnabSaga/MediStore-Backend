import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";
import status from "http-status";
import { auth as betterAuth } from "../lib/auth";

import { USER_ROLES, UserRole } from "../constants/user";
import AppError from "../error/AppError";
import { AuthOptions } from "../interfaces/auth.interface";

const isValidUserRole = (role: unknown): role is UserRole => {
  return typeof role === "string" && USER_ROLES.includes(role as UserRole);
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

      if (session.user.isDeleted) {
        throw new AppError(status.FORBIDDEN, "Your account has been deleted.");
      }

      if (!session.user.isActive) {
        throw new AppError(status.FORBIDDEN, "Your account is inactive. Access denied.");
      }

      if (session.user.isBanned) {
        throw new AppError(status.FORBIDDEN, "Your account is banned. Access denied.");
      }

      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: userRole,
        emailVerified: session.user.emailVerified,
        isBanned: session.user.isBanned,
        isActive: session.user.isActive,
        isDeleted: session.user.isDeleted,
      };

      if (requireVerifiedEmail && !req.user.emailVerified) {
        throw new AppError(
          status.FORBIDDEN,
          "Email verification required. Please check your inbox."
        );
      }

      if (roles.length && !roles.includes(userRole)) {
        throw new AppError(status.FORBIDDEN, "Forbidden. Insufficient permissions.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;
