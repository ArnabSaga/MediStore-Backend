import express from "express";
import multer from "multer";
import { UploadController } from "./upload.controller";
import auth from "../../middleware/auth.middleware";
import { UserRole } from "../../constants/user";

const router = express.Router();

// Memory storage for simple buffer-based uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

router.post(
  "/",
  auth({ roles: [UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN] }),
  upload.single("image"),
  UploadController.uploadImage
);

export const UploadRouter = router;
