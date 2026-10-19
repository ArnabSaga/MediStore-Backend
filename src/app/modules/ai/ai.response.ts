import { AI_NO_MATCH_MESSAGE } from "./ai.constants";
import type { AiMedicineCard } from "./ai.types";

const BDT_FORMATTER = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const cleanText = (value: string, maxLength: number): string => {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

export const formatBdt = (price: number): string => {
  if (!Number.isFinite(price) || price < 0) {
    return "price unavailable";
  }

  return BDT_FORMATTER.format(price).replace(/\u00a0/g, " ");
};

const describeAvailability = (product: AiMedicineCard): string => {
  if (product.stockStatus === "OUT_OF_STOCK" || product.stock <= 0) {
    return "out of stock";
  }

  if (product.stockStatus === "LOW_STOCK") {
    return `low stock with ${product.stock} ${
      product.stock === 1 ? "unit" : "units"
    } remaining`;
  }

  return "in stock";
};

const describeProduct = (product: AiMedicineCard): string => {
  const name = cleanText(product.name, 100);
  const manufacturer = cleanText(product.manufacturer, 80);
  const seller = cleanText(product.seller.name, 80);

  return `${name} by ${manufacturer} — ${formatBdt(product.price)}; ${describeAvailability(
    product
  )}; sold by ${seller}`;
};

/**
 * Product answers are never copied from model prose. Every factual value here
 * comes from a freshly hydrated public catalog record.
 */
export const buildGroundedAnswer = (products: AiMedicineCard[]): string => {
  if (products.length === 0) {
    return AI_NO_MATCH_MESSAGE;
  }

  if (products.length === 1) {
    const [product] = products;
    const name = cleanText(product.name, 100);
    const manufacturer = cleanText(product.manufacturer, 80);
    const seller = cleanText(product.seller.name, 80);

    return `I found ${name} by ${manufacturer} in the MediStore catalog. The current price is ${formatBdt(
      product.price
    )} and it is ${describeAvailability(
      product
    )}. It is sold by ${seller}. See the verified product card below for details.`;
  }

  const lines = products.map((product) => `- ${describeProduct(product)}`).join("\n");

  return `I found ${products.length} matching products in the MediStore catalog.\n\n${lines}\n\nPrices and availability come from the catalog. See the verified product cards below.`;
};

const UNSAFE_TEXT_PATTERNS = [
  /(?:[$€£¥৳]|\b(?:USD|EUR|GBP|BDT|taka|tk)\b)/i,
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|iu)\b/i,
  /\b(?:equivalent(?:\s+to)?|same\s+as)\b/i,
  /\b(?:only\s+)?\d+\s+(?:units?|packs?|strips?|pieces?)\b/i,
  /\b(?:in|out\s+of|low)\s+stock\b/i,
  /\b(?:you\s+should\s+(?:take|use)|take\s+\d+|dosage\s+is|dose\s+is|i\s+(?:recommend|prescribe)|you\s+have\s+(?:an?\s+)?(?:infection|disease|condition|disorder))\b/i,
  /\b(?:diagnos(?:e|ed|is)|prescrib(?:e|ed|ing|ption))\b/i,
];

/**
 * Text-only replies are the one place model prose is still allowed. Reject it
 * when it asserts product facts, prices, stock, strengths, equivalence, or
 * clinical advice that the server cannot verify.
 */
export const isSafeAssistantText = (text: string | undefined): text is string => {
  if (!text) {
    return false;
  }

  const trimmed = text.trim();

  if (trimmed.length === 0 || trimmed.length > 2_000) {
    return false;
  }

  return !UNSAFE_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed));
};
