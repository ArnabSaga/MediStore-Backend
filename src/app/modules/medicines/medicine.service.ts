import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { generateSlug } from "../../helpers/generateSlug";
import type { PaginationOptions } from "../../helpers/paginationSortingHelper";

type CreateMedicinePayload = {
  name: string;
  slug: string;
  description?: string;
  price: number;
  stock: number;
  manufacturer: string;
  categoryId: string;
  imageUrl?: string;
  isActive?: boolean;
  sellerId: string;
};

type UpdateMedicinePayload = {
  name?: string;
  slug?: string;
  description?: string | null;
  price?: number;
  stock?: number;
  manufacturer?: string;
  categoryId?: string;
  imageUrl?: string | null;
  isActive?: boolean;
};

type GetMedicinesFilter = {
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  manufacturer?: string;
};

const ALLOWED_MEDICINE_SORT_FIELDS = new Set([
  "createdAt",
  "price",
  "name",
  "stock",
]);

const createMedicine = async (payload: CreateMedicinePayload) => {
  const slug = generateSlug(payload.slug);

  return prisma.medicine.create({
    data: {
      name: payload.name,
      slug,
      price: new Prisma.Decimal(payload.price),
      stock: payload.stock,
      manufacturer: payload.manufacturer,
      categoryId: payload.categoryId,
      sellerId: payload.sellerId,
      ...(payload.description !== undefined
        ? { description: payload.description }
        : {}),
      ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    },
    include: {
      category: true,
      seller: { select: { id: true, name: true, email: true } },
    },
  });
};

const getAllMedicines = async (
  filters: GetMedicinesFilter,
  pagination: PaginationOptions
) => {
  const where: Prisma.MedicineWhereInput = { isActive: true };

  if (filters.categoryId) where.categoryId = filters.categoryId;

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { manufacturer: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.price = {};
    if (filters.minPrice !== undefined)
      where.price.gte = new Prisma.Decimal(filters.minPrice);
    if (filters.maxPrice !== undefined)
      where.price.lte = new Prisma.Decimal(filters.maxPrice);
  }

  if (filters.manufacturer) {
    where.manufacturer = {
      contains: filters.manufacturer,
      mode: "insensitive",
    };
  }

  const sortBy = ALLOWED_MEDICINE_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  return prisma.medicine.findMany({
    where,
    skip: pagination.skip,
    take: pagination.limit,
    include: {
      category: true,
      seller: { select: { id: true, name: true } },
      reviews: { select: { rating: true } },
    },
    orderBy: { [sortBy]: pagination.sortOrder },
  });
};

const getMedicineById = async (id: string) => {
  return prisma.medicine.findUniqueOrThrow({
    where: { id },
    include: {
      category: true,
      seller: { select: { id: true, name: true, email: true, phone: true } },
      reviews: {
        include: {
          customer: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });
};

const getSellerMedicines = async (
  sellerId: string,
  includeInactive: boolean
) => {
  return prisma.medicine.findMany({
    where: {
      sellerId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      category: true,
      reviews: { select: { rating: true } },
    },
    orderBy: { createdAt: "desc" },
  });
};

const updateMedicineForSeller = async (
  id: string,
  payload: UpdateMedicinePayload,
  sellerId: string
) => {
  const medicine = await prisma.medicine.findUniqueOrThrow({ where: { id } });

  if (medicine.sellerId !== sellerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to update this medicine"),
      {
        statusCode: 403,
      }
    );
  }

  const cleanData: Prisma.MedicineUpdateInput = {};

  if (payload.name !== undefined) {
    if (typeof payload.name !== "string" || payload.name.trim().length < 2) {
      throw Object.assign(new Error("name must be at least 2 characters"), {
        statusCode: 400,
      });
    }
    cleanData.name = payload.name.trim();
  }

  if (payload.slug !== undefined) {
    if (typeof payload.slug !== "string" || payload.slug.trim().length < 2) {
      throw Object.assign(new Error("slug must be at least 2 characters"), {
        statusCode: 400,
      });
    }
    cleanData.slug = generateSlug(payload.slug);
  } else if (payload.name !== undefined) {
    cleanData.slug = generateSlug(payload.name);
  }

  if (payload.description !== undefined)
    cleanData.description = payload.description;
  if (payload.imageUrl !== undefined) cleanData.imageUrl = payload.imageUrl;
  if (payload.isActive !== undefined) cleanData.isActive = payload.isActive;

  if (payload.price !== undefined) {
    if (
      typeof payload.price !== "number" ||
      Number.isNaN(payload.price) ||
      payload.price <= 0
    ) {
      throw Object.assign(new Error("price must be a positive number"), {
        statusCode: 400,
      });
    }
    cleanData.price = new Prisma.Decimal(payload.price);
  }

  if (payload.stock !== undefined) {
    if (!Number.isInteger(payload.stock) || payload.stock < 0) {
      throw Object.assign(new Error("stock must be a non-negative integer"), {
        statusCode: 400,
      });
    }
    cleanData.stock = payload.stock;
  }

  if (payload.manufacturer !== undefined) {
    if (
      typeof payload.manufacturer !== "string" ||
      payload.manufacturer.trim().length < 2
    ) {
      throw Object.assign(
        new Error("manufacturer must be at least 2 characters"),
        { statusCode: 400 }
      );
    }
    cleanData.manufacturer = payload.manufacturer.trim();
  }

  if (payload.categoryId !== undefined) {
    if (
      typeof payload.categoryId !== "string" ||
      payload.categoryId.trim().length === 0
    ) {
      throw Object.assign(new Error("categoryId must be a valid string"), {
        statusCode: 400,
      });
    }
    cleanData.category = { connect: { id: payload.categoryId } };
  }

  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  return prisma.medicine.update({
    where: { id },
    data: cleanData,
    include: {
      category: true,
      seller: { select: { id: true, name: true } },
    },
  });
};

const deleteMedicineForSeller = async (id: string, sellerId: string) => {
  const medicine = await prisma.medicine.findUniqueOrThrow({ where: { id } });

  if (medicine.sellerId !== sellerId) {
    throw Object.assign(
      new Error("Forbidden: unauthorized to delete this medicine"),
      {
        statusCode: 403,
      }
    );
  }

  await prisma.medicine.delete({ where: { id } });
};

const updateMedicineAsAdmin = async (
  id: string,
  payload: UpdateMedicinePayload
) => {
  return updateMedicineForSeller(
    id,
    payload,
    (await prisma.medicine.findUniqueOrThrow({ where: { id } })).sellerId
  );
};

const deleteMedicineAsAdmin = async (id: string) => {
  await prisma.medicine.delete({ where: { id } });
};

export const MedicineService = {
  createMedicine,
  getAllMedicines,
  getMedicineById,
  getSellerMedicines,
  updateMedicineForSeller,
  deleteMedicineForSeller,
  updateMedicineAsAdmin,
  deleteMedicineAsAdmin,
};
