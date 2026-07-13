import { Request, Response } from "express";
import status from "http-status";

import AppError from "../../error/AppError";
import { UserRole } from "../../constants/user";
import catchAsync from "../../utils/catchAsync";
import { queryHelper } from "../../utils/queryHelper";
import { sendResponse } from "../../utils/sendResponse";
import { OrderService } from "./order.service";

const getRequiredParam = (value: unknown, fieldName: string) => {
  const parsed = queryHelper.getSingleValue(value);

  if (parsed === undefined || parsed === null || parsed === "") {
    throw new AppError(status.BAD_REQUEST, `${fieldName} is required`);
  }

  return String(parsed);
};

const createOrder = catchAsync(async (req: Request, res: Response) => {
  const result = await OrderService.createOrder({
    customerId: req.user!.id,
    shippingAddress: req.body.shippingAddress,
    items: req.body.items,
  });

  sendResponse(res, {
    success: true,
    statusCode: status.CREATED,
    message: "Order created successfully",
    data: result,
  });
});

const getUserOrders = catchAsync(async (req: Request, res: Response) => {
  const result = await OrderService.getUserOrders(
    req.user!.id,
    req.query as Record<string, unknown>
  );

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Orders fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getOrderById = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Order id");

  const result = await OrderService.getOrderByIdForCustomer(id, req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Order fetched successfully",
    data: result,
  });
});

const getAdminOrderById = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Order id");

  const result = await OrderService.getOrderByIdForAdmin(id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Order fetched successfully",
    data: result,
  });
});

const cancelOrder = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Order id");

  const result = await OrderService.cancelOrder(id, req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Order cancelled successfully",
    data: result,
  });
});

const getSellerOrders = catchAsync(async (req: Request, res: Response) => {
  const result = await OrderService.getSellerOrders(
    req.user!.id,
    req.query as Record<string, unknown>
  );

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Seller orders fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const updateOrderStatus = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Order id");
  const orderStatus = req.body.status;

  const result =
    req.user!.role === UserRole.SELLER
      ? await OrderService.updateOrderStatus(id, orderStatus, {
          role: UserRole.SELLER,
          sellerId: req.user!.id,
        })
      : await OrderService.updateOrderStatus(id, orderStatus, {
          role: UserRole.ADMIN,
        });

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Order status updated successfully",
    data: result,
  });
});

const getAllOrders = catchAsync(async (req: Request, res: Response) => {
  const result = await OrderService.getAllOrders(req.query as Record<string, unknown>);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Orders fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

export const OrderController = {
  createOrder,
  getUserOrders,
  getOrderById,
  getAdminOrderById,
  cancelOrder,
  getSellerOrders,
  updateOrderStatus,
  getAllOrders,
};
