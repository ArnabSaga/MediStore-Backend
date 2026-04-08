import { prisma } from "../../lib/prisma";
import { generateSlug } from "../../helpers/generateSlug";
import type { PaginationOptions } from "../../helpers/paginationSortingHelper";

const ALLOWED_CATEGORY_SORT_FIELDS = new Set(["createdAt", "name", "slug"]);

type CreateCategoryPayload = {
  name: string;
  slug: string;
  description?: string;
};

type UpdateCategoryPayload = {
  name?: string;
  slug?: string;
  description?: string | null;
};

const createCategory = async (payload: CreateCategoryPayload) => {
  if (!payload.name || !payload.slug) {
    throw Object.assign(new Error("Category name and slug are required"), {
      statusCode: 400,
    });
  }

  const name = payload.name.trim();
  const slug = generateSlug(payload.slug);

  const existing = await prisma.category.findFirst({
    where: {
      OR: [{ slug }, { name }],
    },
    select: { id: true, name: true, slug: true },
  });

  if (existing) {
    throw Object.assign(
      new Error("Category with this name or slug already exists"),
      {
        statusCode: 409,
      }
    );
  }

  return prisma.category.create({
    data: {
      name,
      slug,
      ...(payload.description !== undefined
        ? { description: payload.description }
        : {}),
    },
  });
};

const getAllCategories = async (pagination: PaginationOptions) => {
  const sortBy = ALLOWED_CATEGORY_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  const [data, total] = await prisma.$transaction([
    prisma.category.findMany({
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        medicines: {
          where: { isActive: true },
          select: { id: true, name: true, price: true },
        },
      },
      orderBy: { [sortBy]: pagination.sortOrder },
    }),
    prisma.category.count(),
  ]);

  return {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
    data,
  };
};

const getCategoryById = async (id: string) => {
  return prisma.category.findUniqueOrThrow({
    where: { id },
    include: {
      medicines: {
        where: { isActive: true },
      },
    },
  });
};

const getCategoryBySlug = async (slug: string) => {
  return prisma.category.findUniqueOrThrow({
    where: { slug },
    include: {
      medicines: { where: { isActive: true } },
    },
  });
};

const updateCategory = async (id: string, payload: UpdateCategoryPayload) => {
  const nextPayload: UpdateCategoryPayload = { ...payload };
  if (nextPayload.name && !nextPayload.slug) {
    nextPayload.slug = generateSlug(nextPayload.name);
  }

  if (nextPayload.slug) {
    const existing = await prisma.category.findUnique({
      where: { slug: nextPayload.slug },
      select: { id: true },
    });

    if (existing && existing.id !== id) {
      throw Object.assign(new Error("Category with this slug already exists"), {
        statusCode: 409,
      });
    }
  }

  const cleanData: Record<string, any> = {};
  Object.entries(nextPayload).forEach(([key, value]) => {
    if (value !== undefined) cleanData[key] = value;
  });

  if (Object.keys(cleanData).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  return prisma.category.update({
    where: { id },
    data: cleanData,
  });
};

const deleteCategory = async (id: string) => {
  const medicinesCount = await prisma.medicine.count({
    where: { categoryId: id },
  });

  if (medicinesCount > 0) {
    throw Object.assign(
      new Error(
        `Cannot delete category with ${medicinesCount} medicine(s). Delete/reassign medicines first.`
      ),
      { statusCode: 409 }
    );
  }

  await prisma.category.delete({ where: { id } });
};

export const CategoryService = {
  createCategory,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
  deleteCategory,
};
