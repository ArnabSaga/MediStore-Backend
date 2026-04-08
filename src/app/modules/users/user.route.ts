import express, { Router } from "express";
import auth, { UserRole } from "../../middleware/auth.middleware";
import { UserController } from "./user.controller";

//* UserRouter

const userRouter = express.Router();

userRouter.get(
  "/me",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
    requireVerifiedEmail: true,
  }),
  UserController.getCurrentUser
);

userRouter.put(
  "/profile",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
    requireVerifiedEmail: true,
  }),
  UserController.updateUserProfile
);

//* AdminUserRouter

const adminUserRouter = express.Router();

adminUserRouter.get(
  "/",
  auth({ roles: [UserRole.ADMIN] }),
  UserController.getAllUsers
);

adminUserRouter.get(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  UserController.getUserById
);

adminUserRouter.patch(
  "/:id/status",
  auth({ roles: [UserRole.ADMIN] }),
  UserController.updateUserStatus
);

adminUserRouter.patch(
  "/:id/role",
  auth({ roles: [UserRole.ADMIN] }),
  UserController.changeRole
);

adminUserRouter.delete(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  UserController.deleteUser
);

export const UserRouter: Router = userRouter;
export const AdminUserRouter: Router = adminUserRouter;
