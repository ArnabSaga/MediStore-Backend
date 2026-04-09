import express, { Router } from "express";

import { UserRole } from "../../constants/user";
import auth from "../../middleware/auth.middleware";
import validateRequest from "../../middleware/validateRequest";
import { CategoryController } from "./category.controller";
import { CategoryValidation } from "./category.validation";

const categoryRouter = express.Router();

// Public routes
categoryRouter.get(
  "/",
  validateRequest(CategoryValidation.getAllCategories),
  CategoryController.getAllCategories
);

categoryRouter.get(
  "/slug/:slug",
  validateRequest(CategoryValidation.getCategoryBySlug),
  CategoryController.getCategoryBySlug
);

categoryRouter.get(
  "/:id",
  validateRequest(CategoryValidation.getCategoryById),
  CategoryController.getCategoryById
);

const adminCategoryRouter = express.Router();

// Admin routes
adminCategoryRouter.post(
  "/",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(CategoryValidation.createCategory),
  CategoryController.createCategory
);

adminCategoryRouter.put(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(CategoryValidation.updateCategory),
  CategoryController.updateCategory
);

adminCategoryRouter.patch(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(CategoryValidation.updateCategory),
  CategoryController.updateCategory
);

adminCategoryRouter.delete(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(CategoryValidation.deleteCategory),
  CategoryController.deleteCategory
);

export const CategoryRouter: Router = categoryRouter;
export const AdminCategoryRouter: Router = adminCategoryRouter;
