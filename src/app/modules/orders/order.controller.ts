import { NextFunction, Request, Response } from "express";
import { OrderService } from "./order.service";
import { UserRole } from "../../middleware/auth.middleware";
import {
  validateCreateOrderDTO,
  validateUpdateOrderStatusDTO,
} from "./order.validation";
import paginationSortingHelper from "../../helpers/paginationSortingHelper";

const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const dto = validateCreateOrderDTO(req.body);

    const result = await OrderService.createOrder({
      customerId,
      shippingAddress: dto.shippingAddress,
      items: dto.items,
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getUserOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const pagination = paginationSortingHelper(req.query);

    const result = await OrderService.getUserOrders(userId, pagination);

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const result = await OrderService.getOrderByIdForCustomer(id, userId);

    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const result = await OrderService.cancelOrder(id, userId);

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getSellerOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const pagination = paginationSortingHelper(req.query);

    const result = await OrderService.getSellerOrders(sellerId, pagination);

    res.status(200).json({
      success: true,
      message: "Seller orders fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const actor = req.user;

    if (!actor) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    if (actor.role !== UserRole.SELLER && actor.role !== UserRole.ADMIN) {
      throw Object.assign(new Error("Forbidden. Insufficient permissions."), {
        statusCode: 403,
      });
    }

    const dto = validateUpdateOrderStatusDTO(req.body);

    const result =
      actor.role === UserRole.SELLER
        ? await OrderService.updateOrderStatus(id, dto.status, {
            role: UserRole.SELLER,
            sellerId: actor.id,
          })
        : await OrderService.updateOrderStatus(id, dto.status, {
            role: UserRole.ADMIN,
          });

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAllOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const pagination = paginationSortingHelper(req.query);

    const result = await OrderService.getAllOrders(status, pagination);

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const OrderController = {
  createOrder,
  getUserOrders,
  getOrderById,
  cancelOrder,
  getSellerOrders,
  updateOrderStatus,
  getAllOrders,
};
