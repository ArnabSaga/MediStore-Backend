import { prisma } from "../../lib/prisma";
import { Prisma, OrderStatus } from "@prisma/client";
import { UserRole } from "../../constants/user";
import { ORDER_STATUS, ORDER_STATUSES } from "../../constants/order";
import type { PaginationOptions } from "../../helpers/paginationSortingHelper";

const ALLOWED_ORDER_SORT_FIELDS = new Set([
  "createdAt",
  "totalAmount",
  "status",
]);

interface CreateOrderPayload {
  customerId: string;
  shippingAddress: string;
  items: Array<{
    medicineId: string;
    quantity: number;
  }>;
}

type UpdateActor =
  | { role: typeof UserRole.ADMIN }
  | { role: typeof UserRole.SELLER; sellerId: string };

const VALID_STATUSES = ORDER_STATUSES;

const createOrder = async (payload: CreateOrderPayload) => {
  if (!payload.customerId) {
    throw Object.assign(new Error("customerId is required"), {
      statusCode: 400,
    });
  }

  if (!payload.shippingAddress || typeof payload.shippingAddress !== "string") {
    throw Object.assign(new Error("shippingAddress is required"), {
      statusCode: 400,
    });
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw Object.assign(new Error("Order items are required"), {
      statusCode: 400,
    });
  }

  const medicineIds = payload.items.map((i) => i.medicineId);

  const medicines = await prisma.medicine.findMany({
    where: {
      id: { in: medicineIds },
      isActive: true,
    },
    select: {
      id: true,
      price: true,
      stock: true,
      sellerId: true,
    },
  });

  if (medicines.length !== medicineIds.length) {
    throw Object.assign(
      new Error("One or more medicines not found or inactive"),
      {
        statusCode: 404,
      }
    );
  }

  const medicineMap = new Map(medicines.map((m) => [m.id, m]));

  //* Build order items using DB price + sellerId
  const orderItems = payload.items.map((it) => {
    const med = medicineMap.get(it.medicineId);
    if (!med) {
      throw Object.assign(new Error("Medicine not found"), { statusCode: 404 });
    }

    return {
      medicineId: it.medicineId,
      sellerId: med.sellerId,
      quantity: it.quantity,
      price: med.price, // Decimal from DB
    };
  });

  //* Calculate total with Decimal
  let total = new Prisma.Decimal(0);
  for (const it of orderItems) {
    total = total.plus(new Prisma.Decimal(it.price).mul(it.quantity));
  }

  //* Transaction: decrement stock + create order
  const result = await prisma.$transaction(async (tx) => {
    for (const it of orderItems) {
      const updated = await tx.medicine.updateMany({
        where: {
          id: it.medicineId,
          stock: { gte: it.quantity },
        },
        data: {
          stock: { decrement: it.quantity },
        },
      });

      if (updated.count !== 1) {
        throw Object.assign(
          new Error("Insufficient stock for one or more items"),
          {
            statusCode: 409,
          }
        );
      }
    }

    const created = await tx.order.create({
      data: {
        customerId: payload.customerId,
        totalAmount: total,
        shippingAddress: payload.shippingAddress,
        items: {
          createMany: {
            data: orderItems.map((i) => ({
              medicineId: i.medicineId,
              sellerId: i.sellerId,
              quantity: i.quantity,
              price: i.price,
            })),
          },
        },
      },
      include: {
        items: {
          include: { medicine: true },
        },
      },
    });

    return created;
  });

  return result;
};

const getUserOrders = async (userId: string, pagination: PaginationOptions) => {
  if (!userId) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const sortBy = ALLOWED_ORDER_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  return prisma.order.findMany({
    where: { customerId: userId },
    skip: pagination.skip,
    take: pagination.limit,
    include: { items: { include: { medicine: true } } },
    orderBy: { [sortBy]: pagination.sortOrder },
  });
};

const getOrderByIdForCustomer = async (id: string, userId: string) => {
  const result = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { medicine: true } } },
  });

  if (result.customerId !== userId) {
    throw Object.assign(new Error("Forbidden: order does not belong to you"), {
      statusCode: 403,
    });
  }

  return result;
};

const getAllOrders = async (
  status: string | undefined,
  pagination: PaginationOptions
) => {
  const where: Prisma.OrderWhereInput = {};

  if (status) {
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      throw Object.assign(
        new Error(
          `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
        ),
        { statusCode: 400 }
      );
    }
    where.status = status as OrderStatus;
  }

  const sortBy = ALLOWED_ORDER_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  return prisma.order.findMany({
    where,
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      items: { include: { medicine: true } },
    },
    orderBy: { [sortBy]: pagination.sortOrder },
  });
};

const getSellerOrders = async (
  sellerId: string,
  pagination: PaginationOptions
) => {
  if (!sellerId) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const ALLOWED_ORDER_ITEM_SORT_FIELDS = new Set([
    "createdAt",
    "price",
    "quantity",
  ]);
  const sortBy = ALLOWED_ORDER_ITEM_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  return prisma.orderItem.findMany({
    where: { sellerId },
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      order: {
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      },
      medicine: true,
    },
    orderBy: { [sortBy]: pagination.sortOrder },
  });
};

const updateOrderStatus = async (
  id: string,
  status: OrderStatus,
  actor: UpdateActor
) => {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(
      new Error(
        `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
      ),
      { statusCode: 400 }
    );
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: true },
  });

  //* Seller can update only if all items belong to them
  if (actor.role === UserRole.SELLER) {
    const allBelongToSeller = order.items.every(
      (it) => it.sellerId === actor.sellerId
    );
    if (!allBelongToSeller) {
      throw Object.assign(
        new Error("Forbidden: this order contains items from other sellers"),
        {
          statusCode: 403,
        }
      );
    }
  }

  return prisma.order.update({
    where: { id },
    data: { status },
    include: { items: { include: { medicine: true } } },
  });
};

const cancelOrder = async (id: string, userId: string) => {
  const order = await prisma.order.findUniqueOrThrow({ where: { id } });

  if (order.customerId !== userId) {
    throw Object.assign(
      new Error("Forbidden: cannot cancel someone else's order"),
      {
        statusCode: 403,
      }
    );
  }

  if (order.status !== ORDER_STATUS.PLACED) {
    throw Object.assign(new Error("Only placed orders can be cancelled"), {
      statusCode: 409,
    });
  }

  return prisma.order.update({
    where: { id },
    data: { status: ORDER_STATUS.CANCELLED as OrderStatus },
    include: { items: { include: { medicine: true } } },
  });
};

export const OrderService = {
  createOrder,
  getUserOrders,
  getOrderByIdForCustomer,
  getAllOrders,
  getSellerOrders,
  updateOrderStatus,
  cancelOrder,
};
