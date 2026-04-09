import { z } from "zod";

const medicineIdParamsSchema = z.object({
  id: z.string().uuid("Invalid medicine id"),
});

const medicineImageSchema = z.union([
  z.string().url("Each image must be a valid URL"),
  z.object({
    url: z.string().url("Each image must be a valid URL"),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
]);

const createMedicineBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Medicine name must be at least 2 characters")
    .max(255, "Medicine name cannot exceed 255 characters"),

  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(255, "Slug cannot exceed 255 characters")
    .optional(),

  description: z.string().trim().max(5000, "Description is too long").optional(),

  price: z.coerce.number().positive("Price must be greater than 0"),

  stock: z.coerce.number().int("Stock must be an integer").min(0, "Stock cannot be negative"),

  manufacturer: z
    .string()
    .trim()
    .min(2, "Manufacturer must be at least 2 characters")
    .max(255, "Manufacturer cannot exceed 255 characters"),

  categoryId: z.string().uuid("Invalid category id"),

  imageUrl: z.string().url("Invalid image URL").optional(),

  images: z.array(medicineImageSchema).max(10, "Maximum 10 images are allowed").optional(),

  isActive: z.boolean().optional(),
});

const updateMedicineBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Medicine name must be at least 2 characters")
      .max(255, "Medicine name cannot exceed 255 characters")
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

    price: z.coerce.number().positive("Price must be greater than 0").optional(),

    stock: z.coerce
      .number()
      .int("Stock must be an integer")
      .min(0, "Stock cannot be negative")
      .optional(),

    manufacturer: z
      .string()
      .trim()
      .min(2, "Manufacturer must be at least 2 characters")
      .max(255, "Manufacturer cannot exceed 255 characters")
      .optional(),

    categoryId: z.string().uuid("Invalid category id").optional(),

    imageUrl: z.union([z.string().url("Invalid image URL"), z.null()]).optional(),

    images: z.array(medicineImageSchema).max(10, "Maximum 10 images are allowed").optional(),

    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update medicine",
  });

const getAllMedicinesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "price", "name", "stock"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    categoryId: z.string().uuid("Invalid category id").optional(),
    sellerId: z.string().uuid("Invalid seller id").optional(),
    search: z.string().trim().min(1).max(100).optional(),
    manufacturer: z.string().trim().min(1).max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    isInStock: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => {
        if (typeof value === "boolean") return value;
        return value === "true";
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    {
      message: "minPrice cannot be greater than maxPrice",
      path: ["minPrice"],
    }
  );

const getSellerMedicinesQuerySchema = z
  .object({
    includeInactive: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => {
        if (typeof value === "boolean") return value;
        return value === "true";
      })
      .optional(),

    includeDeleted: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => {
        if (typeof value === "boolean") return value;
        return value === "true";
      })
      .optional(),

    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "price", "name", "stock"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    categoryId: z.string().uuid("Invalid category id").optional(),
    manufacturer: z.string().trim().min(1).max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    isActive: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => {
        if (typeof value === "boolean") return value;
        return value === "true";
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    {
      message: "minPrice cannot be greater than maxPrice",
      path: ["minPrice"],
    }
  );

const adminDeleteMedicineQuerySchema = z.object({
  hardDelete: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((value) => {
      if (typeof value === "boolean") return value;
      return value === "true";
    })
    .optional(),
});

export const MedicineValidation = {
  getAllMedicines: {
    query: getAllMedicinesQuerySchema,
  },
  getMedicineById: {
    params: medicineIdParamsSchema,
  },
  createMedicine: {
    body: createMedicineBodySchema,
  },
  getSellerMedicines: {
    query: getSellerMedicinesQuerySchema,
  },
  updateMedicine: {
    params: medicineIdParamsSchema,
    body: updateMedicineBodySchema,
  },
  deleteMedicine: {
    params: medicineIdParamsSchema,
  },
  adminUpdateMedicine: {
    params: medicineIdParamsSchema,
    body: updateMedicineBodySchema,
  },
  adminDeleteMedicine: {
    params: medicineIdParamsSchema,
    query: adminDeleteMedicineQuerySchema,
  },
};
