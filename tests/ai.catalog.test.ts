import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  medicine: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("../src/app/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { PrismaMedicineCatalog } from "../src/app/modules/ai/ai.catalog";
import {
  aiMedicineAvailabilitySelect,
  aiMedicineCardSelect,
  aiMedicineDetailsSelect,
} from "../src/app/modules/ai/ai.selects";
import { buildPublicMedicineWhere } from "../src/app/modules/medicines/medicine.visibility";
import { MEDICINE_ID, MISSING_ID } from "./ai.test-helpers";

const categoryId = "44444444-4444-4444-8444-444444444444";
const sellerId = "55555555-5555-4555-8555-555555555555";

const cardRecord = {
  id: MEDICINE_ID,
  name: "Napa 500",
  slug: "napa-500",
  manufacturer: "Beximco",
  price: "12.50",
  stock: 4,
  imageUrl: null,
  category: {
    id: categoryId,
    name: "Pain relief",
    slug: "pain-relief",
  },
  seller: {
    id: sellerId,
    name: "Care Pharmacy",
    image: null,
  },
  reviews: [{ rating: 5 }, { rating: 4 }],
};

const detailsRecord = {
  ...cardRecord,
  description: "Public product description",
  medicineImages: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      url: "https://example.com/napa.png",
      sortOrder: 0,
    },
  ],
};

const availabilityRecord = {
  id: MEDICINE_ID,
  name: "Napa 500",
  price: "12.50",
  stock: 4,
};

describe("PrismaMedicineCatalog", () => {
  beforeEach(() => {
    prismaMock.medicine.findMany.mockReset();
    prismaMock.medicine.findFirst.mockReset();
  });

  it("searches only the public catalog with safe fields", async () => {
    prismaMock.medicine.findMany.mockResolvedValue([cardRecord]);
    const catalog = new PrismaMedicineCatalog();

    const products = await catalog.search({ query: "napa", limit: 5 });

    expect(products).toEqual([
      {
        id: MEDICINE_ID,
        name: "Napa 500",
        slug: "napa-500",
        manufacturer: "Beximco",
        price: 12.5,
        stock: 4,
        inStock: true,
        stockStatus: "LOW_STOCK",
        imageUrl: null,
        category: cardRecord.category,
        seller: cardRecord.seller,
        rating: 4.5,
        reviewCount: 2,
      },
    ]);

    const query = prismaMock.medicine.findMany.mock.calls[0][0];
    expect(query.select).toBe(aiMedicineCardSelect);
    expect(query.take).toBe(5);
    expect(query.where).toEqual({
      AND: [
        buildPublicMedicineWhere(),
        {
          OR: [
            { name: { contains: "napa", mode: "insensitive" } },
            { manufacturer: { contains: "napa", mode: "insensitive" } },
            { slug: { contains: "napa", mode: "insensitive" } },
            {
              category: {
                is: {
                  OR: [
                    { name: { contains: "napa", mode: "insensitive" } },
                    { slug: { contains: "napa", mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("matches category names and slugs in free-text searches", async () => {
    prismaMock.medicine.findMany.mockResolvedValue([]);
    const catalog = new PrismaMedicineCatalog();

    await catalog.search({ query: "allergy" });

    const query = prismaMock.medicine.findMany.mock.calls[0][0];
    expect(query.where.AND[1].OR).toEqual(
      expect.arrayContaining([
        {
          category: {
            is: {
              OR: [
                { name: { contains: "allergy", mode: "insensitive" } },
                { slug: { contains: "allergy", mode: "insensitive" } },
              ],
            },
          },
        },
      ])
    );
  });

  it("excludes inactive, deleted, and unverified seller catalog entries in its where clause", async () => {
    prismaMock.medicine.findMany.mockResolvedValue([]);
    const catalog = new PrismaMedicineCatalog();

    await catalog.search({ query: "napa" });

    const publicWhere = prismaMock.medicine.findMany.mock.calls[0][0].where.AND[0];
    expect(publicWhere).toMatchObject({
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
    });
  });

  it("falls back to tokenized search for multi-word queries", async () => {
    prismaMock.medicine.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cardRecord]);
    const catalog = new PrismaMedicineCatalog();

    const products = await catalog.search({ query: "Napa 500" });

    expect(products).toHaveLength(1);
    expect(prismaMock.medicine.findMany).toHaveBeenCalledTimes(2);
    const fallbackWhere = prismaMock.medicine.findMany.mock.calls[1][0].where;
    expect(fallbackWhere.AND[1].OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "Napa", mode: "insensitive" } },
        { name: { contains: "500", mode: "insensitive" } },
      ])
    );
  });

  it("loads details with safe fields and public visibility", async () => {
    prismaMock.medicine.findFirst.mockResolvedValue(detailsRecord);
    const catalog = new PrismaMedicineCatalog();

    const product = await catalog.findDetails(MEDICINE_ID);

    expect(product).toMatchObject({
      id: MEDICINE_ID,
      price: 12.5,
      description: "Public product description",
      images: detailsRecord.medicineImages,
    });

    const query = prismaMock.medicine.findFirst.mock.calls[0][0];
    expect(query.select).toBe(aiMedicineDetailsSelect);
    expect(query.where).toMatchObject({
      id: MEDICINE_ID,
      ...buildPublicMedicineWhere(),
    });
  });

  it("checks availability with a safe select and reports missing ids", async () => {
    prismaMock.medicine.findMany.mockResolvedValue([availabilityRecord]);
    const catalog = new PrismaMedicineCatalog();

    const result = await catalog.checkAvailability([MEDICINE_ID, MISSING_ID]);

    expect(result.products).toEqual([
      {
        id: MEDICINE_ID,
        name: "Napa 500",
        price: 12.5,
        stock: 4,
        inStock: true,
        stockStatus: "LOW_STOCK",
      },
    ]);
    expect(result.missingIds).toEqual([MISSING_ID]);

    const query = prismaMock.medicine.findMany.mock.calls[0][0];
    expect(query.select).toBe(aiMedicineAvailabilitySelect);
    expect(query.where.id.in).toEqual([MEDICINE_ID, MISSING_ID]);
    expect(query.where.isActive).toBe(true);
  });

  it("compares only public medicines and keeps requested order", async () => {
    prismaMock.medicine.findMany.mockResolvedValue([cardRecord]);
    const catalog = new PrismaMedicineCatalog();

    const result = await catalog.compare([MEDICINE_ID, MISSING_ID]);

    expect(result.products).toHaveLength(1);
    expect(result.missingIds).toEqual([MISSING_ID]);
    expect(prismaMock.medicine.findMany.mock.calls[0][0].select).toBe(
      aiMedicineCardSelect
    );
  });

  it("hydrates cards from real records and omits missing ids", async () => {
    prismaMock.medicine.findMany.mockResolvedValue([cardRecord]);
    const catalog = new PrismaMedicineCatalog();

    const products = await catalog.hydrate([MEDICINE_ID, MISSING_ID]);

    expect(products.map((product) => product.id)).toEqual([MEDICINE_ID]);
    expect(prismaMock.medicine.findMany.mock.calls[0][0].select).toBe(
      aiMedicineCardSelect
    );
  });
});
