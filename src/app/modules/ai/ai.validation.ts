import { z } from "zod";

import {
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
  })
  .strict();

const medicineIdSchema = z.string().uuid("Invalid medicine id");

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
  })
  .strict();

export type TShoppingChatRequest = z.infer<typeof shoppingChatRequestSchema>;
export type TFinalizeResponseArgs = z.infer<typeof finalizeResponseArgsSchema>;
