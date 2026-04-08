import express, { Router } from "express";
import auth, { UserRole } from "../../middleware/auth.middleware";
import { CategoryController } from "./category.controller";

const router = express.Router();

//* Public routes
router.get("/", CategoryController.getAllCategories);

router.get("/by-slug/:slug", CategoryController.getCategoryBySlug);
router.get("/:id", CategoryController.getCategoryById);

//* Admin routes
router.post(
  "/",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  CategoryController.createCategory
);

router.put(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  CategoryController.updateCategory
);

router.delete(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  CategoryController.deleteCategory
);

export const CategoryRouter: Router = router;
