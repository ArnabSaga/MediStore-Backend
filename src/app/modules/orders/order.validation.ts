import { OrderStatus } from "../../../generated/prisma/client";
import type { CreateOrderDTO, UpdateOrderStatusDTO } from "./order.dto";

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isPositiveInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) > 0;

export const validateCreateOrderDTO = (body: any): CreateOrderDTO => {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Invalid request body"), { statusCode: 400 });
  }

  if (!isNonEmptyString(body.shippingAddress)) {
    throw Object.assign(new Error("shippingAddress is required"), {
      statusCode: 400,
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw Object.assign(new Error("items must be a non-empty array"), {
      statusCode: 400,
    });
  }

  const items = body.items.map((it: any, idx: number) => {
    if (!it || typeof it !== "object") {
      throw Object.assign(new Error(`items[${idx}] must be an object`), {
        statusCode: 400,
      });
    }

    if (!isNonEmptyString(it.medicineId)) {
      throw Object.assign(new Error(`items[${idx}].medicineId is required`), {
        statusCode: 400,
      });
    }

    if (!isPositiveInt(it.quantity)) {
      throw Object.assign(
        new Error(`items[${idx}].quantity must be a positive integer`),
        {
          statusCode: 400,
        }
      );
    }

    return { medicineId: it.medicineId.trim(), quantity: it.quantity };
  });

  return {
    shippingAddress: body.shippingAddress.trim(),
    items,
  };
};

export const validateUpdateOrderStatusDTO = (
  body: any
): UpdateOrderStatusDTO => {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Invalid request body"), { statusCode: 400 });
  }

  if (!isNonEmptyString(body.status)) {
    throw Object.assign(new Error("status is required"), { statusCode: 400 });
  }

  const validStatuses: OrderStatus[] = [
    "PLACED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ];

  if (!validStatuses.includes(body.status as OrderStatus)) {
    throw Object.assign(
      new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`),
      { statusCode: 400 }
    );
  }

  return { status: body.status as OrderStatus };
};
