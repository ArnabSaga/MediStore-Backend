import status from "http-status";
import { Prisma } from "../../../generated/prisma/client";

import AppError from "../../error/AppError";
import { prisma } from "../../lib/prisma";
import { generateSlug } from "../../utils/generateSlug";
import { queryHelper } from "../../utils/queryHelper";

type TMedicineImageInput =
  | string
  | {
      url: string;
      sortOrder?: number;
    };

type TCreateMedicinePayload = {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  stock: number;
  manufacturer: string;
  categoryId: string;
  imageUrl?: string;
  images?: TMedicineImageInput[];
  isActive?: boolean;
  sellerId: string;
};

type TUpdateMedicinePayload = {
  name?: string;
  slug?: string;
  description?: string | null;
  price?: number;
  stock?: number;
  manufacturer?: string;
  categoryId?: string;
  imageUrl?: string | null;
  images?: TMedicineImageInput[];
  isActive?: boolean;
};

type TMedicineQuery = Record<string, unknown>;

type TDeleteMedicineAsAdminOptions = {
  hardDelete?: boolean;
};

const ALLOWED_MEDICINE_SORT_FIELDS = new Set(["createdAt", "updatedAt", "price", "name", "stock"]);

const getMedicineListInclude = () => ({
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      icon: true,
    },
  },
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
});

const getMedicineDetailsInclude = () => ({
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      icon: true,
      isActive: true,
    },
  },
  seller: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
    },
  },
  reviews: {
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
      createdAt: "desc" as const,
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
});

const getMedicineOwnerInclude = () => ({
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
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
});

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;

  const singleValue = queryHelper.getSingleValue(value);
  if (singleValue === "true") return true;
  if (singleValue === "false") return false;

  return undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  const singleValue = queryHelper.getSingleValue(value);
  if (singleValue === undefined) return undefined;

  const parsed = Number(singleValue);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const buildMedicineStats = (ratings: Array<{ rating: number }>) => {
  const totalReviews = ratings.length;

  const averageRating =
    totalReviews > 0
      ? Number((ratings.reduce((sum, item) => sum + item.rating, 0) / totalReviews).toFixed(2))
      : 0;

  return {
    totalReviews,
    averageRating,
  };
};

const normalizeImageInputs = (images?: TMedicineImageInput[]) => {
  if (!images || images.length === 0) return [];

  return images.map((item, index) => {
    if (typeof item === "string") {
      return {
        url: item.trim(),
        sortOrder: index,
      };
    }

    return {
      url: item.url.trim(),
      sortOrder: item.sortOrder ?? index,
    };
  });
};

const sanitizeMedicineListItem = <
  T extends {
    reviews: Array<{ rating: number }>;
  },
>(
  medicine: T
) => {
  const stats = buildMedicineStats(medicine.reviews);

  const { reviews, ...rest } = medicine;
  return {
    ...rest,
    stats,
  };
};

const ensureCategoryExistsAndUsable = async (categoryId: string, allowInactive = false) => {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      isActive: true,
      isDeleted: true,
    },
  });

  if (!category || category.isDeleted) {
    throw new AppError(status.NOT_FOUND, "Category not found");
  }

  if (!allowInactive && !category.isActive) {
    throw new AppError(status.BAD_REQUEST, "This category is inactive and cannot be used");
  }

  return category;
};

const ensureSellerExistsAndUsable = async (sellerId: string) => {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      role: true,
      emailVerified: true,
      isActive: true,
      isBanned: true,
      isDeleted: true,
    },
  });

  if (!seller || seller.isDeleted) {
    throw new AppError(status.NOT_FOUND, "Seller not found");
  }

  if (seller.role !== "SELLER") {
    throw new AppError(status.FORBIDDEN, "Only sellers can manage medicines");
  }

  if (!seller.isActive || seller.isBanned) {
    throw new AppError(status.FORBIDDEN, "Seller account is not eligible to manage medicines");
  }

  if (!seller.emailVerified) {
    throw new AppError(status.FORBIDDEN, "Seller email must be verified");
  }

  return seller;
};

const ensureMedicineExists = async (id: string, includeDeleted = false) => {
  const medicine = await prisma.medicine.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      slug: true,
      isDeleted: true,
    },
  });

  if (!medicine || (!includeDeleted && medicine.isDeleted)) {
    throw new AppError(status.NOT_FOUND, "Medicine not found");
  }

  return medicine;
};

const ensureUniqueSellerSlug = async (
  sellerId: string,
  slug: string,
  excludeMedicineId?: string
) => {
  const existingMedicine = await prisma.medicine.findFirst({
    where: {
      sellerId,
      slug,
      isDeleted: false,
      ...(excludeMedicineId
        ? {
            NOT: {
              id: excludeMedicineId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });

  if (existingMedicine) {
    throw new AppError(status.CONFLICT, "A medicine with this slug already exists for this seller");
  }
};

const buildPublicMedicineWhere = (): Prisma.MedicineWhereInput => {
  return {
    isActive: true,
    isDeleted: false,
    category: {
      is: {
        isActive: true,
        isDeleted: false,
      },
    },
    seller: {
      is: {
        role: "SELLER",
        emailVerified: true,
        isActive: true,
        isBanned: false,
        isDeleted: false,
      },
    },
  };
};

const createMedicine = async (payload: TCreateMedicinePayload) => {
  await ensureSellerExistsAndUsable(payload.sellerId);
  await ensureCategoryExistsAndUsable(payload.categoryId);

  const finalSlug = generateSlug(payload.slug || payload.name);
  await ensureUniqueSellerSlug(payload.sellerId, finalSlug);

  const normalizedImages = normalizeImageInputs(payload.images);
  const primaryImageUrl =
    payload.imageUrl !== undefined
      ? payload.imageUrl
      : normalizedImages.length > 0
        ? normalizedImages[0].url
        : undefined;

  const createdMedicine = await prisma.medicine.create({
    data: {
      name: payload.name.trim(),
      slug: finalSlug,
      description: payload.description?.trim(),
      price: new Prisma.Decimal(payload.price),
      stock: payload.stock,
      manufacturer: payload.manufacturer.trim(),
      categoryId: payload.categoryId,
      sellerId: payload.sellerId,
      ...(primaryImageUrl !== undefined ? { imageUrl: primaryImageUrl } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(normalizedImages.length > 0
        ? {
            medicineImages: {
              create: normalizedImages.map((image) => ({
                url: image.url,
                sortOrder: image.sortOrder,
              })),
            },
          }
        : {}),
    },
    include: getMedicineOwnerInclude(),
  });

  return sanitizeMedicineListItem(createdMedicine);
};

const getAllMedicines = async (query: TMedicineQuery) => {
  const pagination = queryHelper.parsePagination(query);

  const categoryId = queryHelper.getSingleValue(query.categoryId);
  const sellerId = queryHelper.getSingleValue(query.sellerId);
  const search = queryHelper.getSingleValue(query.search)?.trim();
  const manufacturer = queryHelper.getSingleValue(query.manufacturer)?.trim();
  const isInStock = parseBoolean(query.isInStock);

  const minPrice = parseNumber(query.minPrice);
  const maxPrice = parseNumber(query.maxPrice);

  const sortBy = ALLOWED_MEDICINE_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  const where: Prisma.MedicineWhereInput = buildPublicMedicineWhere();

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (sellerId) {
    where.sellerId = sellerId;
  }

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        manufacturer: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        slug: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (manufacturer) {
    where.manufacturer = {
      contains: manufacturer,
      mode: "insensitive",
    };
  }

  if (isInStock !== undefined) {
    where.stock = isInStock ? { gt: 0 } : { lte: 0 };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {
      ...(minPrice !== undefined ? { gte: new Prisma.Decimal(minPrice) } : {}),
      ...(maxPrice !== undefined ? { lte: new Prisma.Decimal(maxPrice) } : {}),
    };
  }

  const [medicines, total] = await prisma.$transaction([
    prisma.medicine.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: getMedicineListInclude(),
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.medicine.count({ where }),
  ]);

  return {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
    data: medicines.map((medicine) => sanitizeMedicineListItem(medicine)),
  };
};

const getMedicineById = async (id: string) => {
  const medicine = await prisma.medicine.findFirst({
    where: {
      id,
      ...buildPublicMedicineWhere(),
    },
    include: getMedicineDetailsInclude(),
  });

  if (!medicine) {
    throw new AppError(status.NOT_FOUND, "Medicine not found");
  }

  return {
    ...medicine,
    stats: buildMedicineStats(medicine.reviews),
  };
};

const getSellerMedicines = async (sellerId: string, query: TMedicineQuery) => {
  await ensureSellerExistsAndUsable(sellerId);

  const pagination = queryHelper.parsePagination(query);

  const includeInactive = parseBoolean(query.includeInactive) ?? false;
  const includeDeleted = parseBoolean(query.includeDeleted) ?? false;
  const isActive = parseBoolean(query.isActive);
  const categoryId = queryHelper.getSingleValue(query.categoryId);
  const search = queryHelper.getSingleValue(query.search)?.trim();
  const manufacturer = queryHelper.getSingleValue(query.manufacturer)?.trim();

  const minPrice = parseNumber(query.minPrice);
  const maxPrice = parseNumber(query.maxPrice);

  const sortBy = ALLOWED_MEDICINE_SORT_FIELDS.has(pagination.sortBy)
    ? pagination.sortBy
    : "createdAt";

  const where: Prisma.MedicineWhereInput = {
    sellerId,
  };

  if (!includeInactive) {
    where.isActive = true;
  }

  if (!includeDeleted) {
    where.isDeleted = false;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (manufacturer) {
    where.manufacturer = {
      contains: manufacturer,
      mode: "insensitive",
    };
  }

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        manufacturer: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        slug: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {
      ...(minPrice !== undefined ? { gte: new Prisma.Decimal(minPrice) } : {}),
      ...(maxPrice !== undefined ? { lte: new Prisma.Decimal(maxPrice) } : {}),
    };
  }

  const [medicines, total] = await prisma.$transaction([
    prisma.medicine.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      include: getMedicineOwnerInclude(),
      orderBy: {
        [sortBy]: pagination.sortOrder,
      },
    }),
    prisma.medicine.count({ where }),
  ]);

  return {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
    data: medicines.map((medicine) => sanitizeMedicineListItem(medicine)),
  };
};

const buildUpdateData = async (
  payload: TUpdateMedicinePayload,
  sellerIdForSlugCheck: string,
  medicineId: string,
  allowInactiveCategory = false
): Promise<Prisma.MedicineUpdateInput> => {
  const cleanData: Prisma.MedicineUpdateInput = {};

  if (payload.name !== undefined) {
    const trimmedName = payload.name.trim();

    if (!trimmedName) {
      throw new AppError(status.BAD_REQUEST, "Medicine name cannot be empty");
    }

    cleanData.name = trimmedName;
  }

  if (payload.slug !== undefined) {
    const normalizedSlug = generateSlug(payload.slug);

    if (!normalizedSlug) {
      throw new AppError(status.BAD_REQUEST, "Slug is invalid");
    }

    await ensureUniqueSellerSlug(sellerIdForSlugCheck, normalizedSlug, medicineId);
    cleanData.slug = normalizedSlug;
  } else if (payload.name !== undefined) {
    const normalizedSlug = generateSlug(payload.name);

    if (!normalizedSlug) {
      throw new AppError(status.BAD_REQUEST, "Slug is invalid");
    }

    await ensureUniqueSellerSlug(sellerIdForSlugCheck, normalizedSlug, medicineId);
    cleanData.slug = normalizedSlug;
  }

  if (payload.description !== undefined) {
    cleanData.description = payload.description === null ? null : payload.description.trim();
  }

  if (payload.imageUrl !== undefined) {
    cleanData.imageUrl = payload.imageUrl;
  }

  if (payload.isActive !== undefined) {
    cleanData.isActive = payload.isActive;
  }

  if (payload.price !== undefined) {
    cleanData.price = new Prisma.Decimal(payload.price);
  }

  if (payload.stock !== undefined) {
    cleanData.stock = payload.stock;
  }

  if (payload.manufacturer !== undefined) {
    const trimmedManufacturer = payload.manufacturer.trim();

    if (!trimmedManufacturer) {
      throw new AppError(status.BAD_REQUEST, "Manufacturer cannot be empty");
    }

    cleanData.manufacturer = trimmedManufacturer;
  }

  if (payload.categoryId !== undefined) {
    await ensureCategoryExistsAndUsable(payload.categoryId, allowInactiveCategory);
    cleanData.category = {
      connect: {
        id: payload.categoryId,
      },
    };
  }

  if (Object.keys(cleanData).length === 0 && payload.images === undefined) {
    throw new AppError(status.BAD_REQUEST, "No valid fields provided for update");
  }

  return cleanData;
};

const updateMedicineForSeller = async (
  id: string,
  payload: TUpdateMedicinePayload,
  sellerId: string
) => {
  await ensureSellerExistsAndUsable(sellerId);

  const medicine = await ensureMedicineExists(id);

  if (medicine.sellerId !== sellerId) {
    throw new AppError(status.FORBIDDEN, "Forbidden: you are not allowed to update this medicine");
  }

  const cleanData = await buildUpdateData(payload, sellerId, id);

  const normalizedImages = normalizeImageInputs(payload.images);
  const shouldReplaceImages = payload.images !== undefined;

  const primaryImageUrl =
    payload.imageUrl !== undefined
      ? payload.imageUrl
      : shouldReplaceImages
        ? (normalizedImages[0]?.url ?? null)
        : undefined;

  const updatedMedicine = await prisma.$transaction(async (tx) => {
    if (shouldReplaceImages) {
      await tx.medicineImage.deleteMany({
        where: { medicineId: id },
      });
    }

    const updated = await tx.medicine.update({
      where: { id },
      data: {
        ...cleanData,
        ...(primaryImageUrl !== undefined ? { imageUrl: primaryImageUrl } : {}),
        ...(shouldReplaceImages
          ? {
              medicineImages: {
                create: normalizedImages.map((image) => ({
                  url: image.url,
                  sortOrder: image.sortOrder,
                })),
              },
            }
          : {}),
      },
      include: getMedicineOwnerInclude(),
    });

    return updated;
  });

  return sanitizeMedicineListItem(updatedMedicine);
};

const deleteMedicineForSeller = async (id: string, sellerId: string) => {
  await ensureSellerExistsAndUsable(sellerId);

  const medicine = await ensureMedicineExists(id, true);

  if (medicine.sellerId !== sellerId) {
    throw new AppError(status.FORBIDDEN, "Forbidden: you are not allowed to delete this medicine");
  }

  if (medicine.isDeleted) {
    throw new AppError(status.BAD_REQUEST, "Medicine is already deleted");
  }

  await prisma.medicine.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
      slug: `${medicine.slug}-deleted-${Date.now()}`,
    },
  });

  return null;
};

const updateMedicineAsAdmin = async (id: string, payload: TUpdateMedicinePayload) => {
  const medicine = await ensureMedicineExists(id, true);

  const cleanData = await buildUpdateData(payload, medicine.sellerId, id, true);

  const normalizedImages = normalizeImageInputs(payload.images);
  const shouldReplaceImages = payload.images !== undefined;

  const primaryImageUrl =
    payload.imageUrl !== undefined
      ? payload.imageUrl
      : shouldReplaceImages
        ? (normalizedImages[0]?.url ?? null)
        : undefined;

  const updatedMedicine = await prisma.$transaction(async (tx) => {
    if (shouldReplaceImages) {
      await tx.medicineImage.deleteMany({
        where: { medicineId: id },
      });
    }

    const updated = await tx.medicine.update({
      where: { id },
      data: {
        ...cleanData,
        ...(primaryImageUrl !== undefined ? { imageUrl: primaryImageUrl } : {}),
        ...(shouldReplaceImages
          ? {
              medicineImages: {
                create: normalizedImages.map((image) => ({
                  url: image.url,
                  sortOrder: image.sortOrder,
                })),
              },
            }
          : {}),
      },
      include: getMedicineOwnerInclude(),
    });

    return updated;
  });

  return sanitizeMedicineListItem(updatedMedicine);
};

const deleteMedicineAsAdmin = async (id: string, options: TDeleteMedicineAsAdminOptions = {}) => {
  const medicine = await ensureMedicineExists(id, true);

  if (options.hardDelete) {
    const orderItemCount = await prisma.orderItem.count({
      where: { medicineId: id },
    });

    if (orderItemCount > 0) {
      throw new AppError(
        status.CONFLICT,
        "Medicine cannot be permanently deleted because related order items exist"
      );
    }

    await prisma.medicine.delete({
      where: { id },
    });

    return null;
  }

  if (medicine.isDeleted) {
    throw new AppError(status.BAD_REQUEST, "Medicine is already deleted");
  }

  await prisma.medicine.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
      slug: `${medicine.slug}-deleted-${Date.now()}`,
    },
  });

  return null;
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
