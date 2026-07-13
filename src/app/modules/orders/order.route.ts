import express, { Router } from "express";

import { UserRole } from "../../constants/user";
import auth from "../../middleware/auth.middleware";
import validateRequest from "../../middleware/validateRequest";
import { OrderController } from "./order.controller";
import { OrderValidation } from "./order.validation";

const orderRouter = express.Router();

// Customer routes
orderRouter.post(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.createOrder),
  OrderController.createOrder
);

orderRouter.get(
  "/",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.getCustomerOrders),
  OrderController.getUserOrders
);

orderRouter.get(
  "/:id",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.getOrderById),
  OrderController.getOrderById
);

orderRouter.patch(
  "/:id/cancel",
  auth({ roles: [UserRole.CUSTOMER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.cancelOrder),
  OrderController.cancelOrder
);

// Seller routes
const sellerOrderRouter = express.Router();

sellerOrderRouter.get(
  "/",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.getSellerOrders),
  OrderController.getSellerOrders
);

sellerOrderRouter.patch(
  "/:id",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.updateOrderStatus),
  OrderController.updateOrderStatus
);

// Backward-compatible alias
sellerOrderRouter.patch(
  "/:id/status",
  auth({ roles: [UserRole.SELLER], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.updateOrderStatus),
  OrderController.updateOrderStatus
);

// Admin routes
const adminOrderRouter = express.Router();

adminOrderRouter.get(
  "/",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.getAllOrders),
  OrderController.getAllOrders
);

adminOrderRouter.get(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.getOrderById),
  OrderController.getAdminOrderById
);

adminOrderRouter.patch(
  "/:id",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.updateOrderStatus),
  OrderController.updateOrderStatus
);

// Backward-compatible alias
adminOrderRouter.patch(
  "/:id/status",
  auth({ roles: [UserRole.ADMIN], requireVerifiedEmail: true }),
  validateRequest(OrderValidation.updateOrderStatus),
  OrderController.updateOrderStatus
);

export const OrderRouter: Router = orderRouter;
export const SellerOrderRouter: Router = sellerOrderRouter;
export const AdminOrderRouter: Router = adminOrderRouter;
