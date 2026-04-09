import { Router } from "express";
import { AdminCategoryRouter, CategoryRouter } from "../modules/categories/category.route";
import {
  AdminMedicineRouter,
  MedicineRouter,
  SellerMedicineRouter,
} from "../modules/medicines/medicine.route";
import { AdminOrderRouter, OrderRouter, SellerOrderRouter } from "../modules/orders/order.route";
import { ReviewRouter } from "../modules/reviews/review.route";
import { AdminUserRouter, UserRouter } from "../modules/users/user.route";
import { UploadRouter } from "../modules/uploads/upload.route";

type TModuleRoutes = {
  path: string;
  route: Router;
};

const router = Router();

const moduleRoutes: TModuleRoutes[] = [
  { path: "/users", route: UserRouter },
  { path: "/uploads", route: UploadRouter },
  { path: "/categories", route: CategoryRouter },
  { path: "/admin/categories", route: AdminCategoryRouter },
  { path: "/reviews", route: ReviewRouter },
  { path: "/medicines", route: MedicineRouter },
  { path: "/seller/medicines", route: SellerMedicineRouter },
  { path: "/admin/medicines", route: AdminMedicineRouter },
  { path: "/orders", route: OrderRouter },
  { path: "/seller/orders", route: SellerOrderRouter },
  { path: "/admin/orders", route: AdminOrderRouter },
  { path: "/admin/users", route: AdminUserRouter },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
