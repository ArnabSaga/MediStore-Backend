import express, { Router } from "express";

import { UserRole } from "../../constants/user";
import auth from "../../middleware/auth.middleware";
import validateRequest from "../../middleware/validateRequest";
import { MedicineController } from "./medicine.controller";
import { MedicineValidation } from "./medicine.validation";

const medicineRouter = express.Router();

// Public
medicineRouter.get(
  "/",
  validateRequest(MedicineValidation.getAllMedicines),
  MedicineController.getAllMedicines
);

medicineRouter.get(
  "/:id",
  validateRequest(MedicineValidation.getMedicineById),
  MedicineController.getMedicineById
);

const sellerMedicineRouter = express.Router();

// Seller
sellerMedicineRouter.post(
  "/",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.createMedicine),
  MedicineController.createMedicine
);

sellerMedicineRouter.get(
  "/",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.getSellerMedicines),
  MedicineController.getSellerMedicines
);

sellerMedicineRouter.put(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.updateMedicine),
  MedicineController.updateMedicine
);

sellerMedicineRouter.patch(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.updateMedicine),
  MedicineController.updateMedicine
);

sellerMedicineRouter.delete(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.deleteMedicine),
  MedicineController.deleteMedicine
);

const adminMedicineRouter = express.Router();

// Admin
adminMedicineRouter.put(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.adminUpdateMedicine),
  MedicineController.adminUpdateMedicine
);

adminMedicineRouter.patch(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.adminUpdateMedicine),
  MedicineController.adminUpdateMedicine
);

adminMedicineRouter.delete(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(MedicineValidation.adminDeleteMedicine),
  MedicineController.adminDeleteMedicine
);

export const MedicineRouter: Router = medicineRouter;
export const SellerMedicineRouter: Router = sellerMedicineRouter;
export const AdminMedicineRouter: Router = adminMedicineRouter;
