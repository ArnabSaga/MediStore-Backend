import { z } from "zod";

const categoryIdParamsSchema = z.object({
  id: z.string().uuid("Invalid category id"),
});

const categorySlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(255, "Slug cannot exceed 255 characters"),
});

const createCategoryBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(255, "Category name cannot exceed 255 characters"),

  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(255, "Slug cannot exceed 255 characters")
    .optional(),

  description: z.string().trim().max(5000, "Description is too long").optional(),

  imageUrl: z.string().url("Invalid image URL").optional(),

  icon: z.string().trim().max(255, "Icon cannot exceed 255 characters").optional(),

  isActive: z.boolean().optional(),
});

const updateCategoryBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Category name must be at least 2 characters")
      .max(255, "Category name cannot exceed 255 characters")
      .optional(),

    slug: z
      .string()
      .trim()
      .min(2, "Slug must be at least 2 characters")
      .max(255, "Slug cannot exceed 255 characters")
      .optional(),

    description: z
      .union([z.string().trim().max(5000, "Description is too long"), z.null()])
      .optional(),

    imageUrl: z.union([z.string().url("Invalid image URL"), z.null()]).optional(),

    icon: z
      .union([z.string().trim().max(255, "Icon cannot exceed 255 characters"), z.null()])
      .optional(),

    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update category",
  });

const getAllCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name", "slug"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  searchTerm: z.string().trim().min(1).max(100).optional(),
  includeMedicines: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
});

export const CategoryValidation = {
  createCategory: {
    body: createCategoryBodySchema,
  },
  getAllCategories: {
    query: getAllCategoriesQuerySchema,
  },
  getCategoryBySlug: {
    params: categorySlugParamsSchema,
  },
  getCategoryById: {
    params: categoryIdParamsSchema,
  },
  updateCategory: {
    params: categoryIdParamsSchema,
    body: updateCategoryBodySchema,
  },
  deleteCategory: {
    params: categoryIdParamsSchema,
  },
};
