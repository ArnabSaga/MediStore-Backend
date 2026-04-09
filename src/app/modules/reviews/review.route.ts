import express, { Router } from "express";

import { UserRole } from "../../constants/user";
import auth from "../../middleware/auth.middleware";
import validateRequest from "../../middleware/validateRequest";
import { ReviewController } from "./review.controller";
import { ReviewValidation } from "./review.validation";

const reviewRouter = express.Router();

// Public routes
reviewRouter.get(
  "/medicine/:medicineId",
  validateRequest(ReviewValidation.getMedicineReviews),
  ReviewController.getMedicineReviews
);

// Customer routes
reviewRouter.post(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(ReviewValidation.createReview),
  ReviewController.createReview
);

reviewRouter.get(
  "/my-reviews",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(ReviewValidation.getMyReviews),
  ReviewController.getMyReviews
);

reviewRouter.put(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(ReviewValidation.updateReview),
  ReviewController.updateReview
);

reviewRouter.patch(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(ReviewValidation.updateReview),
  ReviewController.updateReview
);

reviewRouter.delete(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(ReviewValidation.deleteReview),
  ReviewController.deleteReview
);

export const ReviewRouter: Router = reviewRouter;
