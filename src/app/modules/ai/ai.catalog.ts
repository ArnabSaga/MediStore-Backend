import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { buildPublicMedicineWhere } from "../medicines/medicine.visibility";
import { AI_LOW_STOCK_THRESHOLD, AI_MAX_SEARCH_RESULTS } from "./ai.constants";
import {
  aiMedicineAvailabilitySelect,
  aiMedicineCardSelect,
  aiMedicineDetailsSelect,
  type AiMedicineAvailabilityRecord,
  type AiMedicineCardRecord,
  type AiMedicineDetailsRecord,
} from "./ai.selects";
import type {
  AiCatalogAvailabilityResult,
  AiCatalogCompareResult,
  AiCatalogSearchInput,
  AiMedicineAvailability,
  AiMedicineCard,
  AiMedicineDetails,
  AiStockStatus,
  MedicineCatalog,
} from "./ai.types";

const getStockStatus = (stock: number): AiStockStatus => {
  if (stock <= 0) {
    return "OUT_OF_STOCK";
  }

  if (stock <= AI_LOW_STOCK_THRESHOLD) {
    return "LOW_STOCK";
  }

  return "IN_STOCK";
};

const getRating = (ratings: number[]): { rating: number; reviewCount: number } => {
  if (ratings.length === 0) {
    return { rating: 0, reviewCount: 0 };
  }

  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;

  return {
    rating: Number(average.toFixed(1)),
    reviewCount: ratings.length,
  };
};

const toCard = (record: AiMedicineCardRecord): AiMedicineCard => {
  const { rating, reviewCount } = getRating(record.reviews.map((review) => review.rating));

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    manufacturer: record.manufacturer,
    price: Number(record.price),
    stock: record.stock,
    inStock: record.stock > 0,
    stockStatus: getStockStatus(record.stock),
    imageUrl: record.imageUrl,
    category: record.category,
    seller: record.seller,
    rating,
    reviewCount,
  };
};

const toDetails = (record: AiMedicineDetailsRecord): AiMedicineDetails => {
  return {
    ...toCard(record),
    description: record.description,
    images: record.medicineImages,
  };
};

const toAvailability = (
  record: AiMedicineAvailabilityRecord
): AiMedicineAvailability => {
  return {
    id: record.id,
    name: record.name,
    price: Number(record.price),
    stock: record.stock,
    inStock: record.stock > 0,
    stockStatus: getStockStatus(record.stock),
  };
};

const buildCategoryWhere = (category?: string): Prisma.MedicineWhereInput | null => {
  const normalized = category?.trim();

  if (!normalized) {
    return null;
  }

  return {
    category: {
      is: {
        OR: [
          { name: { contains: normalized, mode: "insensitive" } },
          { slug: { contains: normalized, mode: "insensitive" } },
        ],
      },
    },
  };
};

const buildCategoryTextWhere = (value: string): Prisma.MedicineWhereInput => {
  return {
    category: {
      is: {
        OR: [
          { name: { contains: value, mode: "insensitive" } },
          { slug: { contains: value, mode: "insensitive" } },
        ],
      },
    },
  };
};

const buildPhraseSearchWhere = (query: string): Prisma.MedicineWhereInput | null => {
  const normalized = query.trim();

  if (!normalized) {
    return null;
  }

  return {
    OR: [
      { name: { contains: normalized, mode: "insensitive" } },
      { manufacturer: { contains: normalized, mode: "insensitive" } },
      { slug: { contains: normalized, mode: "insensitive" } },
      buildCategoryTextWhere(normalized),
    ],
  };
};

const buildTokenSearchWhere = (query: string): Prisma.MedicineWhereInput | null => {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (tokens.length < 2) {
    return null;
  }

  return {
    OR: tokens.flatMap((token) => [
      { name: { contains: token, mode: "insensitive" } },
      { manufacturer: { contains: token, mode: "insensitive" } },
      { slug: { contains: token, mode: "insensitive" } },
      buildCategoryTextWhere(token),
    ]),
  };
};

const buildPublicWhere = (
  searchWhere: Prisma.MedicineWhereInput | null,
  categoryWhere: Prisma.MedicineWhereInput | null
): Prisma.MedicineWhereInput => {
  const and: Prisma.MedicineWhereInput[] = [buildPublicMedicineWhere()];

  if (categoryWhere) {
    and.push(categoryWhere);
  }

  if (searchWhere) {
    and.push(searchWhere);
  }

  return { AND: and };
};

const normalizeLimit = (limit?: number): number => {
  if (!limit || !Number.isInteger(limit) || limit <= 0) {
    return AI_MAX_SEARCH_RESULTS;
  }

  return Math.min(limit, AI_MAX_SEARCH_RESULTS);
};

const uniqueIds = (medicineIds: string[]): string[] => {
  return Array.from(new Set(medicineIds));
};

export class PrismaMedicineCatalog implements MedicineCatalog {
  async search(input: AiCatalogSearchInput): Promise<AiMedicineCard[]> {
    const query = input.query.trim();
    const categoryWhere = buildCategoryWhere(input.category);
    const phraseWhere = buildPhraseSearchWhere(query);

    const records = await prisma.medicine.findMany({
      where: buildPublicWhere(phraseWhere, categoryWhere),
      select: aiMedicineCardSelect,
      orderBy: [{ stock: "desc" }, { name: "asc" }],
      take: normalizeLimit(input.limit),
    });

    if (records.length > 0 || !query) {
      return records.map(toCard);
    }

    // "napa 500" may not exist as a contiguous phrase. Fall back to an
    // OR across tokens so multi-word searches still find the catalog item.
    const tokenWhere = buildTokenSearchWhere(query);

    if (!tokenWhere) {
      return [];
    }

    const fallbackRecords = await prisma.medicine.findMany({
      where: buildPublicWhere(tokenWhere, categoryWhere),
      select: aiMedicineCardSelect,
      orderBy: [{ stock: "desc" }, { name: "asc" }],
      take: normalizeLimit(input.limit),
    });

    return fallbackRecords.map(toCard);
  }

  async findDetails(medicineId: string): Promise<AiMedicineDetails | null> {
    const record = await prisma.medicine.findFirst({
      where: {
        id: medicineId,
        ...buildPublicMedicineWhere(),
      },
      select: aiMedicineDetailsSelect,
    });

    return record ? toDetails(record) : null;
  }

  async checkAvailability(
    medicineIds: string[]
  ): Promise<AiCatalogAvailabilityResult> {
    const requestedIds = uniqueIds(medicineIds).slice(0, AI_MAX_SEARCH_RESULTS);
    const records = await prisma.medicine.findMany({
      where: {
        id: { in: requestedIds },
        ...buildPublicMedicineWhere(),
      },
      select: aiMedicineAvailabilitySelect,
    });

    const recordsById = new Map(records.map((record) => [record.id, record]));
    const products = requestedIds
      .map((id) => recordsById.get(id))
      .filter((record): record is AiMedicineAvailabilityRecord => Boolean(record))
      .map(toAvailability);
    const foundIds = new Set(products.map((product) => product.id));

    return {
      products,
      missingIds: requestedIds.filter((id) => !foundIds.has(id)),
    };
  }

  async compare(medicineIds: string[]): Promise<AiCatalogCompareResult> {
    const requestedIds = uniqueIds(medicineIds).slice(0, AI_MAX_SEARCH_RESULTS);
    const records = await prisma.medicine.findMany({
      where: {
        id: { in: requestedIds },
        ...buildPublicMedicineWhere(),
      },
      select: aiMedicineCardSelect,
    });

    const recordsById = new Map(records.map((record) => [record.id, record]));
    const products = requestedIds
      .map((id) => recordsById.get(id))
      .filter((record): record is AiMedicineCardRecord => Boolean(record))
      .map(toCard);
    const foundIds = new Set(products.map((product) => product.id));

    return {
      products,
      missingIds: requestedIds.filter((id) => !foundIds.has(id)),
    };
  }

  async hydrate(medicineIds: string[]): Promise<AiMedicineCard[]> {
    const requestedIds = uniqueIds(medicineIds).slice(0, AI_MAX_SEARCH_RESULTS);

    if (requestedIds.length === 0) {
      return [];
    }

    const records = await prisma.medicine.findMany({
      where: {
        id: { in: requestedIds },
        ...buildPublicMedicineWhere(),
      },
      select: aiMedicineCardSelect,
    });

    const recordsById = new Map(records.map((record) => [record.id, record]));

    return requestedIds
      .map((id) => recordsById.get(id))
      .filter((record): record is AiMedicineCardRecord => Boolean(record))
      .map(toCard);
  }
}
