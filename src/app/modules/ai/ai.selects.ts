import { Prisma } from "../../../generated/prisma/client";

/**
 * Deliberately narrow selections. Never include seller email/phone, customer
 * data, reviews with author details, or other PII in AI-facing payloads.
 */
export const aiMedicineCardSelect = {
  id: true,
  name: true,
  slug: true,
  manufacturer: true,
  price: true,
  stock: true,
  imageUrl: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
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
    where: {
      isDeleted: false,
      isPublished: true,
    },
    select: {
      rating: true,
    },
  },
} satisfies Prisma.MedicineSelect;

export const aiMedicineDetailsSelect = {
  ...aiMedicineCardSelect,
  description: true,
  medicineImages: {
    select: {
      id: true,
      url: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
    take: 4,
  },
} satisfies Prisma.MedicineSelect;

export const aiMedicineAvailabilitySelect = {
  id: true,
  name: true,
  price: true,
  stock: true,
} satisfies Prisma.MedicineSelect;

export type AiMedicineCardRecord = Prisma.MedicineGetPayload<{
  select: typeof aiMedicineCardSelect;
}>;

export type AiMedicineDetailsRecord = Prisma.MedicineGetPayload<{
  select: typeof aiMedicineDetailsSelect;
}>;

export type AiMedicineAvailabilityRecord = Prisma.MedicineGetPayload<{
  select: typeof aiMedicineAvailabilitySelect;
}>;
