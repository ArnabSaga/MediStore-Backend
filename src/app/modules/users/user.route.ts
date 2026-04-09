import express, { Router } from "express";

import auth from "../../middleware/auth.middleware";
import validateRequest from "../../middleware/validateRequest";
import { UserRole } from "../../constants/user";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const userRouter = express.Router();

userRouter.get(
  "/me",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
  }),
  UserController.getMyProfile
);

userRouter.patch(
  "/me",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
  }),
  validateRequest(UserValidation.updateMyProfile),
  UserController.updateMyProfile
);

// backward compatibility
userRouter.put(
  "/profile",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
  }),
  validateRequest(UserValidation.updateMyProfile),
  UserController.updateMyProfile
);

userRouter.patch(
  "/profile",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
  }),
  validateRequest(UserValidation.updateMyProfile),
  UserController.updateMyProfile
);

userRouter.post(
  "/logout",
  auth({
    roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN],
  }),
  UserController.logout
);

const adminUserRouter = express.Router();

adminUserRouter.get(
  "/",
  auth({ roles: [UserRole.ADMIN] }),
  validateRequest(UserValidation.getAllUsers),
  UserController.getAllUsers
);

adminUserRouter.get(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  validateRequest(UserValidation.getUserById),
  UserController.getUserById
);

adminUserRouter.patch(
  "/:id/status",
  auth({ roles: [UserRole.ADMIN] }),
  validateRequest(UserValidation.updateUserStatus),
  UserController.updateUserStatus
);

adminUserRouter.patch(
  "/:id/role",
  auth({ roles: [UserRole.ADMIN] }),
  validateRequest(UserValidation.changeUserRole),
  UserController.changeUserRole
);

adminUserRouter.delete(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  validateRequest(UserValidation.deleteUser),
  UserController.deleteUser
);

export const UserRouter: Router = userRouter;
export const AdminUserRouter: Router = adminUserRouter;
