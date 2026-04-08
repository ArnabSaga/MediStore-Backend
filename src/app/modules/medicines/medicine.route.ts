import express, { Router } from "express";
import auth, { UserRole } from "../../middleware/auth.middleware";
import { MedicineController } from "./medicine.controller";

//* Public
const medicineRouter = express.Router();
medicineRouter.get("/", MedicineController.getAllMedicines);
medicineRouter.get("/:id", MedicineController.getMedicineById);

//* Seller
const sellerMedicineRouter = express.Router();
sellerMedicineRouter.post(
  "/",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  MedicineController.createMedicine
);

sellerMedicineRouter.get(
  "/",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  MedicineController.getSellerMedicines
);

sellerMedicineRouter.put(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  MedicineController.updateMedicine
);

sellerMedicineRouter.delete(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  MedicineController.deleteMedicine
);

//* Admin 
const adminMedicineRouter = express.Router();
adminMedicineRouter.put(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  MedicineController.adminUpdateMedicine
);

adminMedicineRouter.delete(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  MedicineController.adminDeleteMedicine
);

export const MedicineRouter: Router = medicineRouter;
export const SellerMedicineRouter: Router = sellerMedicineRouter;
export const AdminMedicineRouter: Router = adminMedicineRouter;
