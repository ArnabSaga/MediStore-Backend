import { OrderStatus } from "../../../generated/prisma/client";

export interface CreateOrderItemDTO {
  medicineId: string;
  quantity: number;
}

export interface CreateOrderDTO {
  shippingAddress: string;
  items: CreateOrderItemDTO[];
}

export interface UpdateOrderStatusDTO {
  status: OrderStatus;
}
