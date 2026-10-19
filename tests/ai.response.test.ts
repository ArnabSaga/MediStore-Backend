import { describe, expect, it } from "vitest";

import {
  buildGroundedAnswer,
  formatBdt,
  isSafeAssistantText,
} from "../src/app/modules/ai/ai.response";
import { createCard } from "./ai.test-helpers";

describe("grounded response rendering", () => {
  it("renders database prices in BDT without a non-breaking space", () => {
    const formatted = formatBdt(12.5);

    expect(formatted).toBe("BDT 12.50");
    expect(formatted).not.toContain("\u00a0");
  });

  it("builds a single-product answer from hydrated catalog fields", () => {
    const answer = buildGroundedAnswer([createCard()]);

    expect(answer).toContain("Napa 500");
    expect(answer).toContain("Beximco");
    expect(answer).toContain("BDT 12.50");
    expect(answer).toContain("low stock with 4 units remaining");
    expect(answer).toContain("Care Pharmacy");
    expect(answer).not.toContain("$");
    expect(answer).not.toContain("500mg");
    expect(answer).not.toContain("equivalent");
  });

  it("builds comparisons from verified fields only", () => {
    const answer = buildGroundedAnswer([
      createCard(),
      createCard({
        id: "66666666-6666-4666-8666-666666666666",
        name: "Ace 500",
        manufacturer: "Square",
        price: 8.75,
        stock: 20,
        stockStatus: "IN_STOCK",
        seller: {
          id: "77777777-7777-4777-8777-777777777777",
          name: "Health Mart",
          image: null,
        },
      }),
    ]);

    expect(answer).toContain("2 matching products");
    expect(answer).toContain("Napa 500 by Beximco");
    expect(answer).toContain("Ace 500 by Square");
    expect(answer).toContain("BDT 12.50");
    expect(answer).toContain("BDT 8.75");
    expect(answer).not.toContain("$");
  });

  it("does not invent a product when there are no matches", () => {
    const answer = buildGroundedAnswer([]);

    expect(answer).toContain("couldn't find");
    expect(answer).not.toContain("BDT");
  });

  it("allows neutral text but rejects unsupported product and clinical claims", () => {
    expect(isSafeAssistantText("Hello! What medicine are you looking for?")).toBe(
      true
    );
    expect(isSafeAssistantText("Napa 500 costs $2.51.")).toBe(false);
    expect(isSafeAssistantText("Napa One is a 500mg equivalent.")).toBe(false);
    expect(isSafeAssistantText("Only 4 units are in stock.")).toBe(false);
    expect(isSafeAssistantText("You should take 2 tablets daily.")).toBe(false);
    expect(isSafeAssistantText("You have an infection.")).toBe(false);
    expect(isSafeAssistantText("")).toBe(false);
  });
});
