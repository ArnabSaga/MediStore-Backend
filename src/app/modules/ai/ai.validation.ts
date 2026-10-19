import { z } from "zod";

import {
  AI_MAX_CART_ITEMS,
  AI_MAX_COMPARE_ITEMS,
  AI_MAX_HISTORY_MESSAGES,
  AI_MAX_MESSAGE_LENGTH,
  AI_MAX_PRODUCT_IDS,
  AI_MAX_SEARCH_RESULTS,
} from "./ai.constants";

const historyMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z
      .string()
      .trim()
      .min(1, "History messages cannot be empty")
      .max(AI_MAX_MESSAGE_LENGTH, "History message is too long"),
  })
  .strict();

const medicineIdSchema = z.string().uuid("Invalid medicine id");

const cartRequestItemSchema = z
  .object({
    medicineId: medicineIdSchema,
    quantity: z
      .number()
      .int()
      .min(1, "Cart quantity must be at least 1")
      .max(10_000, "Cart quantity is too large"),
  })
  .strict();

/**
 * Client cart snapshot. The server re-fetches price, stock, seller, and
 * availability from the catalog; only ids and quantities are trusted.
 */
export const cartInputSchema = z
  .object({
    items: z
      .array(cartRequestItemSchema)
      .max(AI_MAX_CART_ITEMS, "Cart is too large"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    value.items.forEach((item, index) => {
      if (seen.has(item.medicineId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "medicineId"],
          message: "Duplicate medicine in the cart",
        });
      }

      seen.add(item.medicineId);
    });
  });

export const shoppingChatRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(AI_MAX_MESSAGE_LENGTH, "Message is too long"),
    history: z
      .array(historyMessageSchema)
      .max(AI_MAX_HISTORY_MESSAGES, "History is too long")
      .optional(),
    cart: cartInputSchema.optional(),
  })
  .strict();

export const searchMedicinesArgsSchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(120, "Search query is too long")
      .default("")
      .describe(
        "One medicine name, manufacturer, or catalog search text. Use a separate call per medicine for comparisons."
      ),
    category: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe(
        "Optional category name or slug such as Allergy. Use with an empty query for category browsing."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(AI_MAX_SEARCH_RESULTS)
      .optional()
      .describe(`Maximum number of results, up to ${AI_MAX_SEARCH_RESULTS}.`),
  })
  .strict();

export const getMedicineDetailsArgsSchema = z
  .object({
    medicineId: medicineIdSchema.describe("A medicine id returned by searchMedicines."),
  })
  .strict();

export const checkAvailabilityArgsSchema = z
  .object({
    medicineIds: z
      .array(medicineIdSchema)
      .min(1)
      .max(AI_MAX_SEARCH_RESULTS)
      .describe("Medicine ids returned by searchMedicines."),
  })
  .strict();

export const compareMedicinesArgsSchema = z
  .object({
    medicineIds: z
      .array(medicineIdSchema)
      .min(2)
      .max(AI_MAX_COMPARE_ITEMS)
      .describe(`Two to ${AI_MAX_COMPARE_ITEMS} medicine ids returned by searchMedicines.`),
  })
  .strict();

export const cartActionItemArgsSchema = z
  .object({
    medicineId: medicineIdSchema.describe(
      "A medicine id already in the customer's cart or returned by a tool in this conversation."
    ),
    quantity: z
      .number()
      .int()
      .min(0)
      .describe(
        "The final desired quantity in the cart. Use 0 to remove this medicine."
      ),
  })
  .strict();

export const cartActionArgsSchema = z
  .object({
    action: z
      .enum(["SET_QTY", "CLEAR"])
      .describe(
        "SET_QTY sets final quantities for the listed medicines. CLEAR empties the whole cart."
      ),
    items: z
      .array(cartActionItemArgsSchema)
      .max(AI_MAX_CART_ITEMS)
      .default([])
      .describe(
        "The medicines to change. Required for SET_QTY; must be empty for CLEAR."
      ),
  })
  .strict();

export const finalizeResponseArgsSchema = z
  .object({
    answer: z
      .string()
      .trim()
      .min(1, "Answer is required")
      .max(2_000, "Answer is too long")
      .describe("The customer-facing answer, grounded in tool results."),
    productIds: z
      .array(medicineIdSchema)
      .max(AI_MAX_PRODUCT_IDS)
      .default([])
      .describe("Only product ids that were returned by a tool in this conversation."),
    cartAction: cartActionArgsSchema
      .optional()
      .describe(
        "Propose a cart change for the customer to confirm. Use SET_QTY to set final quantities or CLEAR to empty the cart. Never use for catalog questions."
      ),
    cartSummary: z
      .boolean()
      .optional()
      .describe(
        "Set true to answer what is currently in the customer's cart. Never combine with cartAction."
      ),
  })
  .strict();

export type TShoppingChatRequest = z.infer<typeof shoppingChatRequestSchema>;
export type TCartActionArgs = z.infer<typeof cartActionArgsSchema>;
export type TCartInput = z.infer<typeof cartInputSchema>;
export type TFinalizeResponseArgs = z.infer<typeof finalizeResponseArgsSchema>;
