import { describe, expect, it } from "vitest";

import {
  aiMedicineAvailabilitySelect,
  aiMedicineCardSelect,
  aiMedicineDetailsSelect,
} from "../src/app/modules/ai/ai.selects";

describe("AI catalog selects", () => {
  it("never selects seller or customer PII", () => {
    const serialized = JSON.stringify([
      aiMedicineCardSelect,
      aiMedicineDetailsSelect,
      aiMedicineAvailabilitySelect,
    ]);

    expect(serialized).not.toMatch(/email|phone|password|customer|address|session/i);
    expect(aiMedicineCardSelect.seller.select).toEqual({
      id: true,
      name: true,
      image: true,
    });
    expect(aiMedicineCardSelect.reviews.select).toEqual({
      rating: true,
    });
  });

  it("filters public reviews and limits image payloads", () => {
    expect(aiMedicineDetailsSelect.medicineImages).toMatchObject({
      take: 4,
      orderBy: { sortOrder: "asc" },
    });
    expect(aiMedicineDetailsSelect.reviews).toMatchObject({
      where: {
        isDeleted: false,
        isPublished: true,
      },
      select: {
        rating: true,
      },
    });
  });
});
