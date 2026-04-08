import express, { Router } from "express";
import auth, { UserRole } from "../../middleware/auth.middleware";
import { OrderController } from "./order.controller";

//* Customer Orders
const orderRouter = express.Router();

orderRouter.post(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  OrderController.createOrder
);

orderRouter.get(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  OrderController.getUserOrders
);

orderRouter.get(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  OrderController.getOrderById
);

orderRouter.patch(
  "/:id/cancel",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  OrderController.cancelOrder
);

//* Seller Orders

const sellerOrderRouter = express.Router();

sellerOrderRouter.get(
  "/",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  OrderController.getSellerOrders
);

sellerOrderRouter.patch(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  OrderController.updateOrderStatus
);

//* Admin Orders
const adminOrderRouter = express.Router();

adminOrderRouter.get(
  "/",
  auth({ roles: [UserRole.ADMIN] }),
  OrderController.getAllOrders
);

adminOrderRouter.patch(
  "/:id",
  auth({ roles: [UserRole.ADMIN] }),
  OrderController.updateOrderStatus
);

export const OrderRouter: Router = orderRouter;
export const SellerOrderRouter: Router = sellerOrderRouter;
export const AdminOrderRouter: Router = adminOrderRouter;
