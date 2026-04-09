import status from "http-status";
import { OrderStatus, PaymentStatus, Prisma } from "../../../generated/prisma/client";

import { ORDER_STATUS, ORDER_STATUSES } from "../../constants/order";
import { UserRole } from "../../constants/user";
import AppError from "../../error/AppError";
import { prisma } from "../../lib/prisma";
import { queryHelper } from "../../utils/queryHelper";

const ALLOWED_ORDER_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "totalAmount",
  "status",
  "paymentStatus",
]);

type TOrderQuery = Record<string, unknown>;

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
const VALID_PAYMENT_STATUSES = Object.values(PaymentStatus);

const ORDER_INCLUDE = {
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
    },
  },
  items: {
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
        },
      },
      medicine: {
        select: {
          id: true,
          name: true,
          slug: true,
          manufacturer: true,
          imageUrl: true,
          price: true,
          stock: true,
          isActive: true,
          isDeleted: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
} satisfies Prisma.OrderInclude;

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;

  const singleValue = queryHelper.getSingleValue(value);
  if (singleValue === "true") return true;
  if (singleValue === "false") return false;

  return undefined;
};

const buildMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

const ensureCustomerExistsAndUsable = async (customerId: string) => {
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      role: true,
      emailVerified: true,
      isActive: true,
      isBanned: true,
      isDeleted: true,
    },
  });

  if (!customer || customer.isDeleted) {
    throw new AppError(status.NOT_FOUND, "Customer not found");
  }

  if (customer.role !== UserRole.CUSTOMER) {
    throw new AppError(status.FORBIDDEN, "Only customers can place orders");
  }

  if (!customer.isActive || customer.isBanned) {
    throw new AppError(status.FORBIDDEN, "Customer account is not eligible to place orders");
  }

  if (!customer.emailVerified) {
    throw new AppError(status.FORBIDDEN, "Customer email must be verified");
  }

  return customer;
};

const sanitizeItems = (items: CreateOrderPayload["items"]) => {
  const quantityMap = new Map<string, number>();

  for (const item of items) {
    if (!item.medicineId) {
      throw new AppError(status.BAD_REQUEST, "Medicine id is required");
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError(status.BAD_REQUEST, "Quantity must be a positive integer");
    }

    quantityMap.set(item.medicineId, (quantityMap.get(item.medicineId) ?? 0) + item.quantity);
  }

  return Array.from(quantityMap.entries()).map(([medicineId, quantity]) => ({
    medicineId,
    quantity,
  }));
};

const createOrder = async (payload: CreateOrderPayload) => {
  if (!payload.customerId) {
    throw new AppError(status.BAD_REQUEST, "customerId is required");
  }

  if (!payload.shippingAddress || typeof payload.shippingAddress !== "string") {
    throw new AppError(status.BAD_REQUEST, "shippingAddress is required");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new AppError(status.BAD_REQUEST, "Order items are required");
  }

  await ensureCustomerExistsAndUsable(payload.customerId);

  const normalizedItems = sanitizeItems(payload.items);
  const medicineIds = normalizedItems.map((i) => i.medicineId);

  const medicines = await prisma.medicine.findMany({
    where: {
      id: { in: medicineIds },
      isActive: true,
      isDeleted: false,
      seller: {
        is: {
          role: "SELLER",
          emailVerified: true,
          isActive: true,
          isBanned: false,
          isDeleted: false,
        },
      },
      category: {
        is: {
          isActive: true,
          isDeleted: false,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      manufacturer: true,
      imageUrl: true,
      price: true,
      stock: true,
      sellerId: true,
    },
  });

  if (medicines.length !== medicineIds.length) {
    throw new AppError(status.NOT_FOUND, "One or more medicines not found or inactive");
  }

  const distinctSellerIds = new Set(medicines.map((m) => m.sellerId));
  if (distinctSellerIds.size > 1) {
    throw new AppError(
      status.BAD_REQUEST,
      "For now, one order can contain medicines from only one seller"
    );
  }

  const medicineMap = new Map(medicines.map((m) => [m.id, m]));

  const orderItems = normalizedItems.map((it) => {
    const med = medicineMap.get(it.medicineId);

    if (!med) {
      throw new AppError(status.NOT_FOUND, "Medicine not found");
    }

    return {
      medicineId: it.medicineId,
      sellerId: med.sellerId,
      quantity: it.quantity,
      price: med.price,
      medicineName: med.name,
      medicineSlug: med.slug,
      manufacturer: med.manufacturer,
      imageUrl: med.imageUrl ?? null,
    };
  });

  let total = new Prisma.Decimal(0);

  for (const it of orderItems) {
    total = total.plus(new Prisma.Decimal(it.price).mul(it.quantity));
  }

  const result = await prisma.$transaction(async (tx) => {
    for (const it of orderItems) {
      const updated = await tx.medicine.updateMany({
        where: {
          id: it.medicineId,
          stock: { gte: it.quantity },
          isActive: true,
          isDeleted: false,
        },
        data: {
          stock: { decrement: it.quantity },
        },
      });

      if (updated.count !== 1) {
        throw new AppError(status.CONFLICT, "Insufficient stock for one or more items");
      }
    }

    const created = await tx.order.create({
      data: {
        customerId: payload.customerId,
        totalAmount: total,
        shippingAddress: payload.shippingAddress.trim(),
        items: {
          createMany: {
            data: orderItems.map((i) => ({
              medicineId: i.medicineId,
              sellerId: i.sellerId,
              quantity: i.quantity,
              price: i.price,
              medicineName: i.medicineName,
              medicineSlug: i.medicineSlug,
              manufacturer: i.manufacturer,
              imageUrl: i.imageUrl,
            })),
          },
        },
      },
      include: ORDER_INCLUDE,
    });

    return created;
  });

  return result;
};

const getUserOrders = async (userId: string, query: TOrderQuery) => {
  await ensureCustomerExistsAndUsable(userId);

  const pagination = queryHelper.parsePagination(query);
  const statusFilter = queryHelper.getSingleValue(query.status);
  const paymentStatusFilter = queryHelper.getSingleValue(query.paymentStatus);

  const sortBy = ALLOWED_ORDER_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";

  let parsedStatus: OrderStatus | undefined;
  let parsedPaymentStatus: PaymentStatus | undefined;

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter as OrderStatus)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
      );
    }

    parsedStatus = statusFilter as OrderStatus;
  }

  if (paymentStatusFilter) {
    if (!VALID_PAYMENT_STATUSES.includes(paymentStatusFilter as PaymentStatus)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid payment status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
      );
    }

    parsedPaymentStatus = paymentStatusFilter as PaymentStatus;
  }

  const where: Prisma.OrderWhereInput = {
    customerId: userId,
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(parsedPaymentStatus ? { paymentStatus: parsedPaymentStatus } : {}),
  };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: ORDER_INCLUDE,
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    meta: buildMeta(pagination.page, pagination.limit, total),
    data: orders,
  };
};

const getOrderByIdForCustomer = async (id: string, userId: string) => {
  await ensureCustomerExistsAndUsable(userId);

  const result = await prisma.order.findUnique({
    where: { id },
    include: ORDER_INCLUDE,
  });

  if (!result) {
    throw new AppError(status.NOT_FOUND, "Order not found");
  }

  if (result.customerId !== userId) {
    throw new AppError(status.FORBIDDEN, "Forbidden: order does not belong to you");
  }

  return result;
};

const getAllOrders = async (query: TOrderQuery) => {
  const pagination = queryHelper.parsePagination(query);
  const statusFilter = queryHelper.getSingleValue(query.status);
  const paymentStatusFilter = queryHelper.getSingleValue(query.paymentStatus);
  const customerId = queryHelper.getSingleValue(query.customerId);

  const sortBy = ALLOWED_ORDER_SORT_FIELDS.has(pagination.sortBy) ? pagination.sortBy : "createdAt";

  let parsedStatus: OrderStatus | undefined;
  let parsedPaymentStatus: PaymentStatus | undefined;

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter as OrderStatus)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
      );
    }

    parsedStatus = statusFilter as OrderStatus;
  }

  if (paymentStatusFilter) {
    if (!VALID_PAYMENT_STATUSES.includes(paymentStatusFilter as PaymentStatus)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid payment status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
      );
    }

    parsedPaymentStatus = paymentStatusFilter as PaymentStatus;
  }

  const where: Prisma.OrderWhereInput = {
    ...(customerId ? { customerId } : {}),
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(parsedPaymentStatus ? { paymentStatus: parsedPaymentStatus } : {}),
  };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: ORDER_INCLUDE,
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    meta: buildMeta(pagination.page, pagination.limit, total),
    data: orders,
  };
};

const getSellerOrders = async (sellerId: string, query: TOrderQuery) => {
  const pagination = queryHelper.parsePagination(query);
  const statusFilter = queryHelper.getSingleValue(query.status);
  const paymentStatusFilter = queryHelper.getSingleValue(query.paymentStatus);

  const ALLOWED_ORDER_ITEM_SORT_FIELDS = new Set(["createdAt", "price", "quantity"]);
  const sortBy = ALLOWED_ORDER_ITEM_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  let parsedStatus: OrderStatus | undefined;
  let parsedPaymentStatus: PaymentStatus | undefined;

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter as OrderStatus)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
      );
    }

    parsedStatus = statusFilter as OrderStatus;
  }

  if (paymentStatusFilter) {
    if (!VALID_PAYMENT_STATUSES.includes(paymentStatusFilter as PaymentStatus)) {
      throw new AppError(
        status.BAD_REQUEST,
        `Invalid payment status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
      );
    }

    parsedPaymentStatus = paymentStatusFilter as PaymentStatus;
  }

  const orderWhere: Prisma.OrderWhereInput = {
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(parsedPaymentStatus ? { paymentStatus: parsedPaymentStatus } : {}),
  };

  const where: Prisma.OrderItemWhereInput = {
    sellerId,
    ...(Object.keys(orderWhere).length > 0 ? { order: { is: orderWhere } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.orderItem.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            totalAmount: true,
            status: true,
            paymentStatus: true,
            shippingAddress: true,
            createdAt: true,
            updatedAt: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                image: true,
              },
            },
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            image: true,
          },
        },
        medicine: {
          select: {
            id: true,
            name: true,
            slug: true,
            manufacturer: true,
            imageUrl: true,
            price: true,
            stock: true,
            isActive: true,
            isDeleted: true,
          },
        },
      },
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.orderItem.count({ where }),
  ]);

  return {
    meta: buildMeta(pagination.page, pagination.limit, total),
    data: items,
  };
};

const updateOrderStatus = async (id: string, orderStatus: OrderStatus, actor: UpdateActor) => {
  if (!VALID_STATUSES.includes(orderStatus)) {
    throw new AppError(
      status.BAD_REQUEST,
      `Invalid order status. Must be one of: ${VALID_STATUSES.join(", ")}`
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
    },
  });

  if (!order) {
    throw new AppError(status.NOT_FOUND, "Order not found");
  }

  if (actor.role === UserRole.SELLER) {
    const allBelongToSeller = order.items.every((it) => it.sellerId === actor.sellerId);

    if (!allBelongToSeller) {
      throw new AppError(
        status.FORBIDDEN,
        "Forbidden: this order contains items from other sellers"
      );
    }
  }

  if (order.status === OrderStatus.CANCELLED) {
    throw new AppError(status.CONFLICT, "Cancelled orders cannot be updated");
  }

  if (order.status === OrderStatus.DELIVERED) {
    throw new AppError(status.CONFLICT, "Delivered orders cannot be updated");
  }

  const allowedNextStatuses: Record<OrderStatus, OrderStatus[]> = {
    PLACED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
    PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    SHIPPED: [OrderStatus.DELIVERED],
    DELIVERED: [],
    CANCELLED: [],
  };

  if (!allowedNextStatuses[order.status].includes(orderStatus)) {
    throw new AppError(
      status.CONFLICT,
      `Invalid status transition from ${order.status} to ${orderStatus}`
    );
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      status: orderStatus,
    },
    include: ORDER_INCLUDE,
  });

  return updatedOrder;
};

const cancelOrder = async (id: string, userId: string) => {
  await ensureCustomerExistsAndUsable(userId);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
    },
  });

  if (!order) {
    throw new AppError(status.NOT_FOUND, "Order not found");
  }

  if (order.customerId !== userId) {
    throw new AppError(status.FORBIDDEN, "Forbidden: cannot cancel someone else's order");
  }

  if (order.status !== ORDER_STATUS.PLACED) {
    throw new AppError(status.CONFLICT, "Only placed orders can be cancelled");
  }

  const result = await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.medicine.update({
        where: { id: item.medicineId },
        data: {
          stock: {
            increment: item.quantity,
          },
        },
      });
    }

    const updatedOrder = await tx.order.update({
      where: { id },
      data: {
        status: ORDER_STATUS.CANCELLED as OrderStatus,
      },
      include: ORDER_INCLUDE,
    });

    return updatedOrder;
  });

  return result;
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
