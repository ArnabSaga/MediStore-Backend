import { z } from "zod";

import type {
  AiToolDeclaration,
  AiToolExecutionResult,
  MedicineCatalog,
} from "./ai.types";
import {
  checkAvailabilityArgsSchema,
  compareMedicinesArgsSchema,
  finalizeResponseArgsSchema,
  getMedicineDetailsArgsSchema,
  searchMedicinesArgsSchema,
} from "./ai.validation";

const toParametersJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(schema) as Record<
    string,
    unknown
  >;

  return jsonSchema;
};

export const AI_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "searchMedicines",
    description:
      "Search the public MediStore catalog by medicine name, manufacturer, or category. Returns safe product summaries only. For comparisons or multiple named medicines, call this once per medicine in the same turn.",
    parametersJsonSchema: toParametersJsonSchema(searchMedicinesArgsSchema),
  },
  {
    name: "getMedicineDetails",
    description:
      "Get public details for a single medicine that was already returned by searchMedicines.",
    parametersJsonSchema: toParametersJsonSchema(getMedicineDetailsArgsSchema),
  },
  {
    name: "checkAvailability",
    description:
      "Check current stock and price for one or more medicines that were already returned by searchMedicines.",
    parametersJsonSchema: toParametersJsonSchema(checkAvailabilityArgsSchema),
  },
  {
    name: "compareMedicines",
    description:
      "Compare public price, stock, category, seller, and rating for two to four medicines already returned by searchMedicines.",
    parametersJsonSchema: toParametersJsonSchema(compareMedicinesArgsSchema),
  },
  {
    name: "finalizeResponse",
    description:
      "Finish the response with the customer-facing answer and only the product ids returned by tools in this conversation. Optionally include a cartAction to propose a cart change (SET_QTY or CLEAR) or cartSummary: true to describe the customer's current cart. Cart changes apply only after the customer confirms.",
    parametersJsonSchema: toParametersJsonSchema(finalizeResponseArgsSchema),
  },
];

const invalidArguments = (error: z.ZodError): AiToolExecutionResult => {
  return {
    response: {
      ok: false,
      error: {
        code: "INVALID_ARGUMENTS",
        message: "The tool arguments were invalid. Correct them and try again.",
        issues: error.issues.slice(0, 5).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    },
    productIds: [],
  };
};

const toolExecutionFailed = (): AiToolExecutionResult => {
  return {
    response: {
      ok: false,
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: "The catalog could not be queried. Try again or answer without products.",
      },
    },
    productIds: [],
  };
};

const notFound = (): AiToolExecutionResult => {
  return {
    response: {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "No public medicine matched that id.",
      },
    },
    productIds: [],
  };
};

const ungroundedMedicineId = (): AiToolExecutionResult => {
  return {
    response: {
      ok: false,
      error: {
        code: "UNGROUNDED_MEDICINE_ID",
        message:
          "Only medicine ids returned by a tool in this conversation can be used. Search first.",
      },
    },
    productIds: [],
  };
};

export class AiToolExecutor {
  constructor(private readonly catalog: MedicineCatalog) {}

  async execute(
    name: string,
    args: unknown,
    allowedMedicineIds: ReadonlySet<string>
  ): Promise<AiToolExecutionResult> {
    try {
      if (name === "searchMedicines") {
        const parsed = searchMedicinesArgsSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error);
        }

        const products = await this.catalog.search({
          query: parsed.data.query,
          category: parsed.data.category,
          limit: parsed.data.limit,
        });

        return {
          response: {
            ok: true,
            products,
            count: products.length,
          },
          productIds: products.map((product) => product.id),
        };
      }

      if (name === "getMedicineDetails") {
        const parsed = getMedicineDetailsArgsSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error);
        }

        if (!allowedMedicineIds.has(parsed.data.medicineId)) {
          return ungroundedMedicineId();
        }

        const product = await this.catalog.findDetails(parsed.data.medicineId);

        if (!product) {
          return notFound();
        }

        return {
          response: {
            ok: true,
            product,
          },
          productIds: [product.id],
        };
      }

      if (name === "checkAvailability") {
        const parsed = checkAvailabilityArgsSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error);
        }

        if (parsed.data.medicineIds.some((id) => !allowedMedicineIds.has(id))) {
          return ungroundedMedicineId();
        }

        const result = await this.catalog.checkAvailability(parsed.data.medicineIds);

        return {
          response: {
            ok: true,
            products: result.products,
            missingIds: result.missingIds,
          },
          productIds: result.products.map((product) => product.id),
        };
      }

      if (name === "compareMedicines") {
        const parsed = compareMedicinesArgsSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error);
        }

        if (parsed.data.medicineIds.some((id) => !allowedMedicineIds.has(id))) {
          return ungroundedMedicineId();
        }

        const result = await this.catalog.compare(parsed.data.medicineIds);

        return {
          response: {
            ok: true,
            products: result.products,
            missingIds: result.missingIds,
          },
          productIds: result.products.map((product) => product.id),
        };
      }

      return {
        response: {
          ok: false,
          error: {
            code: "UNKNOWN_TOOL",
            message: "That tool does not exist.",
          },
        },
        productIds: [],
      };
    } catch (error) {
      console.error("[ai] catalog tool failed", {
        tool: name,
        error: error instanceof Error ? error.name : "unknown",
      });

      return toolExecutionFailed();
    }
  }
}
