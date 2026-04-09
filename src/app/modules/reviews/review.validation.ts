import { z } from "zod";

const reviewIdParamsSchema = z.object({
  id: z.string().uuid("Invalid review id"),
});

const medicineIdParamsSchema = z.object({
  medicineId: z.string().uuid("Invalid medicine id"),
});

const createReviewBodySchema = z.object({
  medicineId: z
    .string({
      message: "Medicine ID is required",
    })
    .uuid("Invalid medicine id"),

  rating: z
    .number({
      message: "Rating is required",
    })
    .int("Rating must be an integer")
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),

  comment: z
    .string({
      message: "Comment is required",
    })
    .trim()
    .min(3, "Comment must be at least 3 characters")
    .max(3000, "Comment is too long"),
});

const updateReviewBodySchema = z
  .object({
    rating: z
      .number()
      .int("Rating must be an integer")
      .min(1, "Rating must be at least 1")
      .max(5, "Rating must be at most 5")
      .optional(),

    comment: z
      .string()
      .trim()
      .min(3, "Comment must be at least 3 characters")
      .max(3000, "Comment is too long")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update review",
  });

const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "rating"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const getMedicineReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "rating"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});

const getMyReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "rating"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  includeDeleted: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
});

export const ReviewValidation = {
  createReview: {
    body: createReviewBodySchema,
  },
  getMedicineReviews: {
    params: medicineIdParamsSchema,
    query: getMedicineReviewsQuerySchema,
  },
  getMyReviews: {
    query: getMyReviewsQuerySchema,
  },
  updateReview: {
    params: reviewIdParamsSchema,
    body: updateReviewBodySchema,
  },
  deleteReview: {
    params: reviewIdParamsSchema,
  },

  // backward compatibility
  createReviewValidationSchema: {
    body: createReviewBodySchema,
  },
  updateReviewValidationSchema: {
    body: updateReviewBodySchema,
  },
  reviewListQuerySchema: {
    query: reviewListQuerySchema,
  },
};
