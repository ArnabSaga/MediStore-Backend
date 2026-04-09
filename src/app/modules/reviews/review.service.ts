import status from "http-status";
import { OrderStatus, Prisma } from "../../../generated/prisma/client";

import { UserRole } from "../../constants/user";
import AppError from "../../error/AppError";
import { prisma } from "../../lib/prisma";
import { queryHelper } from "../../utils/queryHelper";

const ALLOWED_REVIEW_SORT_FIELDS = new Set(["createdAt", "updatedAt", "rating"]);

type TReviewQuery = Record<string, unknown>;

interface CreateReviewPayload {
  customerId: string;
  medicineId: string;
  rating: number;
  comment: string;
}

interface UpdateReviewPayload {
  rating?: number;
  comment?: string;
}

const REVIEW_INCLUDE = {
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
      slug: true,
      imageUrl: true,
      manufacturer: true,
      isActive: true,
      isDeleted: true,
      seller: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.ReviewInclude;

const buildMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;

  const singleValue = queryHelper.getSingleValue(value);
  if (singleValue === "true") return true;
  if (singleValue === "false") return false;

  return undefined;
};

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
    throw new AppError(status.FORBIDDEN, "Only customers can review medicines");
  }

  if (!customer.isActive || customer.isBanned) {
    throw new AppError(status.FORBIDDEN, "Customer account is not eligible to review medicines");
  }

  if (!customer.emailVerified) {
    throw new AppError(status.FORBIDDEN, "Customer email must be verified");
  }

  return customer;
};

const ensureMedicineExistsAndReviewable = async (medicineId: string) => {
  const medicine = await prisma.medicine.findUnique({
    where: { id: medicineId },
    select: {
      id: true,
      isActive: true,
      isDeleted: true,
      seller: {
        select: {
          id: true,
          role: true,
          emailVerified: true,
          isActive: true,
          isBanned: true,
          isDeleted: true,
        },
      },
      category: {
        select: {
          id: true,
          isActive: true,
          isDeleted: true,
        },
      },
    },
  });

  if (!medicine || medicine.isDeleted) {
    throw new AppError(status.NOT_FOUND, "Medicine not found");
  }

  if (!medicine.isActive) {
    throw new AppError(status.BAD_REQUEST, "This medicine is inactive");
  }

  if (!medicine.category || medicine.category.isDeleted || !medicine.category.isActive) {
    throw new AppError(status.BAD_REQUEST, "This medicine category is inactive");
  }

  if (
    !medicine.seller ||
    medicine.seller.isDeleted ||
    medicine.seller.role !== UserRole.SELLER ||
    !medicine.seller.emailVerified ||
    !medicine.seller.isActive ||
    medicine.seller.isBanned
  ) {
    throw new AppError(status.BAD_REQUEST, "This medicine is not available for review");
  }

  return medicine;
};

const ensureReviewExists = async (id: string, includeDeleted = false) => {
  const review = await prisma.review.findUnique({
    where: { id },
    select: {
      id: true,
      customerId: true,
      medicineId: true,
      isDeleted: true,
      isPublished: true,
    },
  });

  if (!review || (!includeDeleted && review.isDeleted)) {
    throw new AppError(status.NOT_FOUND, "Review not found");
  }

  return review;
};

const createReview = async (payload: CreateReviewPayload) => {
  await ensureCustomerExistsAndUsable(payload.customerId);
  await ensureMedicineExistsAndReviewable(payload.medicineId);

  const hasDeliveredOrder = await prisma.orderItem.findFirst({
    where: {
      medicineId: payload.medicineId,
      order: {
        is: {
          customerId: payload.customerId,
          status: OrderStatus.DELIVERED,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!hasDeliveredOrder) {
    throw new AppError(
      status.FORBIDDEN,
      "You can review this medicine only after it has been delivered to you"
    );
  }

  const existingReview = await prisma.review.findFirst({
    where: {
      customerId: payload.customerId,
      medicineId: payload.medicineId,
    },
    select: {
      id: true,
      isDeleted: true,
    },
  });

  if (existingReview && !existingReview.isDeleted) {
    throw new AppError(status.CONFLICT, "You have already reviewed this medicine");
  }

  if (existingReview && existingReview.isDeleted) {
    const restoredReview = await prisma.review.update({
      where: { id: existingReview.id },
      data: {
        rating: payload.rating,
        comment: payload.comment.trim(),
        isDeleted: false,
        deletedAt: null,
        isPublished: true,
      },
      include: REVIEW_INCLUDE,
    });

    return restoredReview;
  }

  const result = await prisma.review.create({
    data: {
      customerId: payload.customerId,
      medicineId: payload.medicineId,
      rating: payload.rating,
      comment: payload.comment.trim(),
    },
    include: REVIEW_INCLUDE,
  });

  return result;
};

const getMedicineReviews = async (medicineId: string, query: TReviewQuery) => {
  await ensureMedicineExistsAndReviewable(medicineId);

  const pagination = queryHelper.parsePagination(query);
  const sortBy = ALLOWED_REVIEW_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  const minRatingValue = queryHelper.getSingleValue(query.minRating);
  const minRating =
    minRatingValue !== undefined && !Number.isNaN(Number(minRatingValue))
      ? Number(minRatingValue)
      : undefined;

  const where: Prisma.ReviewWhereInput = {
    medicineId,
    isDeleted: false,
    isPublished: true,
  };

  if (minRating !== undefined) {
    where.rating = {
      gte: minRating,
    };
  }

  const [reviews, total, aggregate] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({
      where,
      _avg: {
        rating: true,
      },
      _count: {
        rating: true,
      },
    }),
  ]);

  return {
    meta: buildMeta(pagination.page, pagination.limit, total),
    summary: {
      averageRating: Number((aggregate._avg.rating ?? 0).toFixed(2)),
      totalReviews: aggregate._count.rating ?? 0,
    },
    data: reviews,
  };
};

const getUserReviews = async (customerId: string, query: TReviewQuery) => {
  await ensureCustomerExistsAndUsable(customerId);

  const pagination = queryHelper.parsePagination(query);
  const includeDeleted = parseBoolean(query.includeDeleted) ?? false;

  const sortBy = ALLOWED_REVIEW_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  const where: Prisma.ReviewWhereInput = {
    customerId,
    ...(includeDeleted ? {} : { isDeleted: false }),
  };

  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: REVIEW_INCLUDE,
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.review.count({ where }),
  ]);

  return {
    meta: buildMeta(pagination.page, pagination.limit, total),
    data: reviews,
  };
};

const updateReview = async (id: string, customerId: string, payload: UpdateReviewPayload) => {
  await ensureCustomerExistsAndUsable(customerId);

  const review = await ensureReviewExists(id);

  if (review.customerId !== customerId) {
    throw new AppError(status.FORBIDDEN, "Forbidden: you cannot update this review");
  }

  const cleanData: Prisma.ReviewUpdateInput = {};

  if (payload.rating !== undefined) {
    cleanData.rating = payload.rating;
  }

  if (payload.comment !== undefined) {
    const trimmedComment = payload.comment.trim();

    if (!trimmedComment) {
      throw new AppError(status.BAD_REQUEST, "Comment cannot be empty");
    }

    cleanData.comment = trimmedComment;
  }

  if (Object.keys(cleanData).length === 0) {
    throw new AppError(status.BAD_REQUEST, "No valid fields provided for update");
  }

  const updatedReview = await prisma.review.update({
    where: { id },
    data: cleanData,
    include: REVIEW_INCLUDE,
  });

  return updatedReview;
};

const deleteReview = async (id: string, customerId: string) => {
  await ensureCustomerExistsAndUsable(customerId);

  const review = await ensureReviewExists(id);

  if (review.customerId !== customerId) {
    throw new AppError(status.FORBIDDEN, "Forbidden: you cannot delete this review");
  }

  await prisma.review.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isPublished: false,
    },
  });

  return null;
};

export const ReviewService = {
  createReview,
  getMedicineReviews,
  getUserReviews,
  updateReview,
  deleteReview,
};
