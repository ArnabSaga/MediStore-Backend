import { prisma } from "../../lib/prisma";
import { OrderStatus } from "../../../generated/prisma/client";
import type { PaginationOptions } from "../../helpers/paginationSortingHelper";

const ALLOWED_REVIEW_SORT_FIELDS = new Set(["createdAt", "rating"]);

interface CreateReviewPayload {
  customerId: string;
  medicineId: string;
  rating: number;
  comment: string;
}

interface UpdateReviewPayload {
  rating?: number | undefined;
  comment?: string | undefined;
}

const createReview = async (payload: CreateReviewPayload) => {
  const hasDeliveredOrder = await prisma.orderItem.findFirst({
    where: {
      medicineId: payload.medicineId,
      order: {
        customerId: payload.customerId,
        status: "DELIVERED" as OrderStatus,
      },
    },
    select: { id: true },
  });

  if (!hasDeliveredOrder) {
    throw Object.assign(
      new Error("You can review only after this medicine is delivered to you."),
      { statusCode: 403 }
    );
  }

  const result = await prisma.review.create({
    data: payload,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      medicine: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return result;
};

const getMedicineReviews = async (
  medicineId: string,
  pagination: PaginationOptions
) => {
  const sortBy = ALLOWED_REVIEW_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  return prisma.review.findMany({
    where: { medicineId },
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      customer: { select: { id: true, name: true, image: true } },
    },
    orderBy: { [sortBy]: pagination.sortOrder },
  });
};

const getUserReviews = async (
  customerId: string,
  pagination: PaginationOptions
) => {
  const sortBy = ALLOWED_REVIEW_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  return prisma.review.findMany({
    where: { customerId },
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      medicine: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { [sortBy]: pagination.sortOrder },
  });
};

const updateReview = async (
  id: string,
  customerId: string,
  payload: UpdateReviewPayload
) => {
  const review = await prisma.review.findUniqueOrThrow({ where: { id } });

  if (review.customerId !== customerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to update this review"),
      {
        statusCode: 403,
      }
    );
  }

  const cleanData: Record<string, any> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) cleanData[key] = value;
  });

  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  return prisma.review.update({
    where: { id },
    data: cleanData,
    include: {
      customer: { select: { id: true, name: true, image: true } },
      medicine: { select: { id: true, name: true } },
    },
  });
};

const deleteReview = async (id: string, customerId: string) => {
  const review = await prisma.review.findUniqueOrThrow({ where: { id } });

  if (review.customerId !== customerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to delete this review"),
      {
        statusCode: 403,
      }
    );
  }

  await prisma.review.delete({ where: { id } });
};

export const ReviewService = {
  createReview,
  getMedicineReviews,
  getUserReviews,
  updateReview,
  deleteReview,
};
