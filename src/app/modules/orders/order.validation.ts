import { z } from "zod";
import { OrderStatus, PaymentStatus } from "../../../generated/prisma/client";

const orderIdParamsSchema = z.object({
  id: z.string().uuid("Invalid order id"),
});

const createOrderBodySchema = z.object({
  shippingAddress: z
    .string({
      message: "Shipping address is required",
    })
    .trim()
    .min(5, "Shipping address must be at least 5 characters")
    .max(2000, "Shipping address is too long"),

  items: z
    .array(
      z.object({
        medicineId: z
          .string({
            message: "Medicine ID is required",
          })
          .uuid("Invalid medicine id"),
        quantity: z
          .number({
            message: "Quantity is required",
          })
          .int("Quantity must be an integer")
          .positive("Quantity must be a positive integer"),
      })
    )
    .min(1, "At least one item is required"),
});

const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "totalAmount", "status", "paymentStatus"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
});

const sellerOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "price", "quantity"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
});

const adminOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "totalAmount", "status", "paymentStatus"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  customerId: z.string().uuid("Invalid customer id").optional(),
});

const updateOrderStatusBodySchema = z.object({
  status: z.nativeEnum(OrderStatus, {
    message: "Status is required",
  }),
});

export const OrderValidation = {
  createOrder: {
    body: createOrderBodySchema,
  },
  getCustomerOrders: {
    query: orderListQuerySchema,
  },
  getSellerOrders: {
    query: sellerOrderListQuerySchema,
  },
  getAllOrders: {
    query: adminOrderListQuerySchema,
  },
  getOrderById: {
    params: orderIdParamsSchema,
  },
  cancelOrder: {
    params: orderIdParamsSchema,
  },
  updateOrderStatus: {
    params: orderIdParamsSchema,
    body: updateOrderStatusBodySchema,
  },

  createOrderValidationSchema: {
    body: createOrderBodySchema,
  },
  updateOrderStatusValidationSchema: {
    body: updateOrderStatusBodySchema,
  },
};
