export const ORDER_STATUS = {
  PLACED: "PLACED",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;

export const ORDER_STATUSES = Object.values(ORDER_STATUS);

export type TOrderStatus = keyof typeof ORDER_STATUS;
