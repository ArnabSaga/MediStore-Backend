import express, { Router } from "express";
import auth, { UserRole } from "../../middleware/auth.middleware";
import { ReviewController } from "./review.controller";

const router = express.Router();

//* Public routes
router.get("/medicine/:medicineId", ReviewController.getMedicineReviews);

//* Customer routes
router.post(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  ReviewController.createReview
);

router.get(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  ReviewController.getUserReviews
);

router.put(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  ReviewController.updateReview
);

router.delete(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  ReviewController.deleteReview
);

export const ReviewRouter: Router = router;
