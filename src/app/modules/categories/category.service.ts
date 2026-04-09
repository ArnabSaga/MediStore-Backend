import status from "http-status";
import { Prisma } from "../../../generated/prisma/client";

import AppError from "../../error/AppError";
import { prisma } from "../../lib/prisma";
import { generateSlug } from "../../utils/generateSlug";
import { queryHelper } from "../../utils/queryHelper";

type TCreateCategoryPayload = {
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  icon?: string;
  isActive?: boolean;
};

type TUpdateCategoryPayload = {
  name?: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  icon?: string | null;
  isActive?: boolean;
};

type TCategoryQuery = Record<string, unknown>;

const ALLOWED_CATEGORY_SORT_FIELDS = new Set(["createdAt", "updatedAt", "name", "slug"]);

const CATEGORY_PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  icon: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

const buildPublicMedicineWhere = (): Prisma.MedicineWhereInput => {
  return {
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
  };
};

const getCategoryListInclude = () => ({
  medicines: {
    where: buildPublicMedicineWhere(),
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      imageUrl: true,
      stock: true,
      manufacturer: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 8,
  },
});

const getCategoryDetailsInclude = () => ({
  medicines: {
    where: buildPublicMedicineWhere(),
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
      reviews: {
        select: {
          rating: true,
        },
      },
      medicineImages: {
        select: {
          id: true,
          url: true,
          sortOrder: true,
        },
        orderBy: {
          sortOrder: "asc" as const,
        },
      },
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
});

const ensureCategoryExists = async (id: string, includeDeleted = false) => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      isDeleted: true,
    },
  });

  if (!category || (!includeDeleted && category.isDeleted)) {
    throw new AppError(status.NOT_FOUND, "Category not found");
  }

  return category;
};

const ensureUniqueCategoryNameAndSlug = async (
  name: string,
  slug: string,
  excludeCategoryId?: string
) => {
  const existing = await prisma.category.findFirst({
    where: {
      isDeleted: false,
      OR: [{ name }, { slug }],
      ...(excludeCategoryId
        ? {
            NOT: {
              id: excludeCategoryId,
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!existing) return;

  if (existing.name === name) {
    throw new AppError(status.CONFLICT, "A category with this name already exists");
  }

  if (existing.slug === slug) {
    throw new AppError(status.CONFLICT, "A category with this slug already exists");
  }

  throw new AppError(status.CONFLICT, "A category with this name or slug already exists");
};

const buildCategoryStats = (
  medicines: Array<{
    reviews: Array<{ rating: number }>;
  }>
) => {
  const totalMedicines = medicines.length;
  const allRatings = medicines.flatMap((medicine) => medicine.reviews);
  const totalReviews = allRatings.length;

  const averageRating =
    totalReviews > 0
      ? Number((allRatings.reduce((sum, item) => sum + item.rating, 0) / totalReviews).toFixed(2))
      : 0;

  return {
    totalMedicines,
    totalReviews,
    averageRating,
  };
};

const createCategory = async (payload: TCreateCategoryPayload) => {
  const name = payload.name.trim();

  if (!name) {
    throw new AppError(status.BAD_REQUEST, "Category name is required");
  }

  const slug = generateSlug(payload.slug || payload.name);

  if (!slug) {
    throw new AppError(status.BAD_REQUEST, "Category slug is invalid");
  }

  await ensureUniqueCategoryNameAndSlug(name, slug);

  const createdCategory = await prisma.category.create({
    data: {
      name,
      slug,
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
      ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    },
    select: CATEGORY_PUBLIC_SELECT,
  });

  return createdCategory;
};

const getAllCategories = async (query: TCategoryQuery) => {
  const pagination = queryHelper.parsePagination(query);

  const searchTerm = queryHelper.getSingleValue(query.searchTerm)?.trim();
  const includeMedicines = queryHelper.getSingleValue(query.includeMedicines) === "true";

  const sortBy =
    typeof pagination.sortBy === "string" && ALLOWED_CATEGORY_SORT_FIELDS.has(pagination.sortBy)
      ? pagination.sortBy
      : "createdAt";

  const where: Prisma.CategoryWhereInput = {
    isDeleted: false,
    isActive: true,
  };

  if (searchTerm) {
    where.OR = [
      {
        name: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        slug: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
    ];
  }

  const total = await prisma.category.count({ where });

  if (includeMedicines) {
    const categories = await prisma.category.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
      select: {
        ...CATEGORY_PUBLIC_SELECT,
        medicines: getCategoryListInclude().medicines,
      },
    });

    return {
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
      data: categories.map((category) => ({
        ...category,
        stats: {
          totalMedicines: category.medicines.length,
        },
      })),
    };
  }

  const categories = await prisma.category.findMany({
    where,
    skip: pagination.skip,
    take: pagination.limit,
    orderBy: {
      [sortBy]: pagination.sortOrder,
    },
    select: CATEGORY_PUBLIC_SELECT,
  });

  return {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
    data: categories,
  };
};

const getCategoryById = async (id: string) => {
  await ensureCategoryExists(id);

  const category = await prisma.category.findFirst({
    where: {
      id,
      isDeleted: false,
      isActive: true,
    },
    include: getCategoryDetailsInclude(),
  });

  if (!category) {
    throw new AppError(status.NOT_FOUND, "Category not found");
  }

  return {
    ...category,
    stats: buildCategoryStats(category.medicines),
  };
};

const getCategoryBySlug = async (slug: string) => {
  const category = await prisma.category.findFirst({
    where: {
      slug,
      isDeleted: false,
      isActive: true,
    },
    include: getCategoryDetailsInclude(),
  });

  if (!category) {
    throw new AppError(status.NOT_FOUND, "Category not found");
  }

  return {
    ...category,
    stats: buildCategoryStats(category.medicines),
  };
};

const updateCategory = async (id: string, payload: TUpdateCategoryPayload) => {
  const existingCategory = await ensureCategoryExists(id);

  const cleanData: Prisma.CategoryUpdateInput = {};

  if (payload.name !== undefined) {
    const trimmedName = payload.name.trim();

    if (!trimmedName) {
      throw new AppError(status.BAD_REQUEST, "Category name cannot be empty");
    }

    cleanData.name = trimmedName;
  }

  if (payload.slug !== undefined) {
    const normalizedSlug = generateSlug(payload.slug);

    if (!normalizedSlug) {
      throw new AppError(status.BAD_REQUEST, "Category slug is invalid");
    }

    cleanData.slug = normalizedSlug;
  } else if (payload.name !== undefined) {
    const normalizedSlug = generateSlug(payload.name);

    if (!normalizedSlug) {
      throw new AppError(status.BAD_REQUEST, "Category slug is invalid");
    }

    cleanData.slug = normalizedSlug;
  }

  if (payload.description !== undefined) {
    cleanData.description = payload.description === null ? null : payload.description.trim();
  }

  if (payload.imageUrl !== undefined) {
    cleanData.imageUrl = payload.imageUrl;
  }

  if (payload.icon !== undefined) {
    cleanData.icon = payload.icon;
  }

  if (payload.isActive !== undefined) {
    cleanData.isActive = payload.isActive;
  }

  if (Object.keys(cleanData).length === 0) {
    throw new AppError(status.BAD_REQUEST, "No valid fields provided for update");
  }

  await ensureUniqueCategoryNameAndSlug(
    (cleanData.name as string) ?? existingCategory.name,
    (cleanData.slug as string) ?? existingCategory.slug,
    id
  );

  const updatedCategory = await prisma.category.update({
    where: { id },
    data: cleanData,
    select: CATEGORY_PUBLIC_SELECT,
  });

  return updatedCategory;
};

const deleteCategory = async (id: string) => {
  await ensureCategoryExists(id);

  const activeMedicineCount = await prisma.medicine.count({
    where: {
      categoryId: id,
      isDeleted: false,
    },
  });

  if (activeMedicineCount > 0) {
    throw new AppError(
      status.CONFLICT,
      "Category cannot be deleted because medicines are associated with it"
    );
  }

  await prisma.category.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
      slug: `deleted-${id}-${Date.now()}`,
    },
  });

  return null;
};

export const CategoryService = {
  createCategory,
  getAllCategories,
  getCategoryBySlug,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
