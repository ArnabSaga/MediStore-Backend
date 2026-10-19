import { performance } from "node:perf_hooks";
import status from "http-status";

import { envVars } from "../../config/env";
import AppError from "../../error/AppError";
import {
  buildCartConflict,
  buildCartContext,
  buildCartProposal,
  buildCartProposalAnswer,
  buildCartSummary,
  buildCartSummaryAnswer,
  planCartAction,
  verifyFinalCart,
} from "./ai.cart";
import { PrismaMedicineCatalog } from "./ai.catalog";
import {
  AI_FALLBACK_MESSAGE,
  AI_MAX_PRODUCT_IDS,
  AI_NO_MATCH_MESSAGE,
  AI_SAFE_RESPONSE_MESSAGE,
} from "./ai.constants";
import { AiProviderError } from "./ai.errors";
import {
  createAiRequestMetrics,
  elapsedMs,
  logAiMetrics,
  type AiRequestMetrics,
} from "./ai.metrics";
import { buildAiSystemPrompt } from "./ai.prompt";
import { buildGroundedAnswer, isSafeAssistantText } from "./ai.response";
import { AI_TOOL_DECLARATIONS, AiToolExecutor } from "./ai.tools";
import type {
  AiCartConflict,
  AiCartContext,
  AiCartInput,
  AiCartProduct,
  AiCartProposal,
  AiCartSummary,
  AiMedicineCard,
  AiShoppingChatInput,
  AiShoppingChatResult,
  AiToolResponse,
  AiTurn,
  MedicineCatalog,
  AiProvider,
} from "./ai.types";
import {
  finalizeResponseArgsSchema,
  type TFinalizeResponseArgs,
} from "./ai.validation";
import { GeminiAiProvider } from "./providers/gemini.provider";

export interface ShoppingChatService {
  chat(input: AiShoppingChatInput): Promise<AiShoppingChatResult>;
}

export interface AiShoppingChatServiceOptions {
  maxToolRounds: number;
  maxToolCalls: number;
  timeoutMs: number;
  /**
   * A search-only agent turn is finalized from verified catalog records instead
   * of spending another model generation on a factual summary.
   */
  enableSearchFastPath?: boolean;
  metricsLogger?: (metrics: AiRequestMetrics, model: string) => void;
}

type RequiredAiShoppingChatServiceOptions = Required<AiShoppingChatServiceOptions>;

const defaultOptions = (): RequiredAiShoppingChatServiceOptions => {
  return {
    maxToolRounds: envVars.AI_MAX_TOOL_ROUNDS,
    maxToolCalls: envVars.AI_MAX_TOOL_CALLS,
    timeoutMs: envVars.AI_TIMEOUT_MS,
    enableSearchFastPath: true,
    metricsLogger: logAiMetrics,
  };
};

const invalidFinalizeResponse = (): Record<string, unknown> => {
  return {
    ok: false,
    error: {
      code: "INVALID_ARGUMENTS",
      message:
        "finalizeResponse requires a non-empty answer and an array of product ids. Use only ids returned by tools.",
    },
  };
};

/**
 * Retry-only cart errors are returned to the model instead of the customer.
 * The model must correct the action and call finalizeResponse again.
 */
const cartRetryResponse = (conflict: AiCartConflict): Record<string, unknown> => {
  return {
    ok: false,
    error: {
      code: conflict.code,
      message: conflict.message,
    },
  };
};

const mapProviderError = (error: AiProviderError): AppError => {
  if (error.code === "TIMEOUT") {
    return new AppError(
      status.GATEWAY_TIMEOUT,
      "The AI assistant took too long to respond. Please try again."
    );
  }

  if (error.code === "QUOTA") {
    return new AppError(
      status.SERVICE_UNAVAILABLE,
      "The AI assistant is temporarily unavailable because the provider limit was reached. Please try again later."
    );
  }

  if (error.code === "INVALID_RESPONSE") {
    return new AppError(
      status.BAD_GATEWAY,
      "The AI assistant returned an invalid response. Please try again."
    );
  }

  return new AppError(
    status.SERVICE_UNAVAILABLE,
    "The AI assistant is temporarily unavailable. Please try again later."
  );
};

export class AiShoppingChatService implements ShoppingChatService {
  private readonly executor: AiToolExecutor;
  private readonly options: RequiredAiShoppingChatServiceOptions;

  constructor(
    private readonly provider: AiProvider,
    private readonly catalog: MedicineCatalog = new PrismaMedicineCatalog(),
    options: AiShoppingChatServiceOptions = defaultOptions()
  ) {
    this.options = { ...defaultOptions(), ...options };
    this.executor = new AiToolExecutor(catalog);
  }

  async chat(input: AiShoppingChatInput): Promise<AiShoppingChatResult> {
    const metrics = createAiRequestMetrics();
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, this.options.timeoutMs);

    let toolCalls = 0;
    let toolRounds = 0;
    const seenProductIds = new Set<string>();

    try {
      // The cart snapshot is verified against the catalog before the model
      // sees it, so prices, stock, and sellers in the prompt are server data.
      const cartContext = await this.loadCartContext(input.cart, metrics);
      const cartMedicineIds = new Set(
        (cartContext?.items ?? []).map((item) => item.id)
      );
      const session = this.provider.createChat({
        systemInstruction: buildAiSystemPrompt(cartContext),
        tools: AI_TOOL_DECLARATIONS,
        history: input.history ?? [],
        signal: abortController.signal,
      });

      let turn = await this.runProvider("provider:initial", metrics, () =>
        session.sendUserMessage(input.message)
      );

      while (true) {
        this.assertWithinBudget(abortController, metrics);

        if (turn.functionCalls.length === 0) {
          return await this.buildTextResult(
            turn,
            seenProductIds,
            toolCalls,
            abortController,
            metrics
          );
        }

        const toolResponses: AiToolResponse[] = [];
        let invalidFinalize = false;
        let successfulSearchCalls = 0;
        let executedNonSearch = false;

        for (const call of turn.functionCalls) {
          toolCalls += 1;
          metrics.toolCalls = toolCalls;

          if (toolCalls > this.options.maxToolCalls) {
            return this.buildFallbackResult(toolCalls, metrics);
          }

          if (call.name === "finalizeResponse") {
            const parsed = finalizeResponseArgsSchema.safeParse(call.args);

            if (!parsed.success) {
              invalidFinalize = true;
              toolResponses.push({
                name: call.name,
                id: call.id,
                response: invalidFinalizeResponse(),
              });
              continue;
            }

            if (parsed.data.cartAction || parsed.data.cartSummary) {
              const outcome = await this.buildCartOutcome(
                parsed.data,
                cartContext,
                new Set([...seenProductIds, ...cartMedicineIds]),
                toolCalls,
                abortController,
                metrics
              );

              if (outcome.kind === "retry") {
                invalidFinalize = true;
                toolResponses.push({
                  name: call.name,
                  id: call.id,
                  response: cartRetryResponse(outcome.conflict),
                });
                continue;
              }

              return outcome.result;
            }

            return await this.buildFinalizedResult(
              parsed.data,
              seenProductIds,
              toolCalls,
              abortController,
              metrics
            );
          }

          const result = await this.runDatabaseOperation("catalog:tool", metrics, () =>
            this.executor.execute(
              call.name,
              call.args,
              new Set([...seenProductIds, ...cartMedicineIds])
            )
          );

          if (call.name === "searchMedicines") {
            if (result.response.ok === true) {
              successfulSearchCalls += 1;
            }
          } else {
            executedNonSearch = true;
          }

          for (const productId of result.productIds) {
            seenProductIds.add(productId);
          }

          toolResponses.push({
            name: call.name,
            id: call.id,
            response: result.response,
          });
        }

        if (toolResponses.length === 0) {
          return this.buildFallbackResult(toolCalls, metrics);
        }

        // Fast path: a search-only turn is finalized from the database. This
        // removes one Gemini generation and guarantees that the prose cannot
        // invent prices, strengths, equivalence claims, or stock levels.
        //
        // Skipped whenever a cart snapshot is attached: the model only learns
        // product ids from search results, so it needs the follow-up turn to
        // reach finalizeResponse with a cart action. API clients without a
        // cart keep the fast path unchanged.
        if (
          this.options.enableSearchFastPath &&
          input.cart === undefined &&
          toolRounds === 0 &&
          successfulSearchCalls > 0 &&
          !executedNonSearch &&
          !invalidFinalize
        ) {
          return await this.buildGroundedResult(
            seenProductIds,
            toolCalls,
            abortController,
            metrics
          );
        }

        if (toolRounds >= this.options.maxToolRounds) {
          return this.buildFallbackResult(toolCalls, metrics);
        }

        toolRounds += 1;
        metrics.toolRounds = toolRounds;
        turn = await this.runProvider("provider:tool-results", metrics, () =>
          session.sendToolResults(toolResponses)
        );

        if (invalidFinalize && turn.functionCalls.length === 0) {
          // Let a text-only follow-up after an invalid finalize count as a
          // normal answer rather than a second fallback.
          return await this.buildTextResult(
            turn,
            seenProductIds,
            toolCalls,
            abortController,
            metrics
          );
        }
      }
    } catch (error) {
      if (error instanceof AiProviderError) {
        metrics.errorCategory = error.code;

        if (error.code === "TIMEOUT") {
          metrics.timeoutStage =
            metrics.timeoutStage ?? metrics.stage ?? "unknown";
        }

        throw mapProviderError(error);
      }

      if (error instanceof AppError) {
        // Cart verification rejections are client-visible (4xx); a 5xx
        // AppError here is an infrastructure failure while reading the cart.
        metrics.errorCategory = error.statusCode < 500 ? "CLIENT" : "CATALOG";

        throw error;
      }

      metrics.errorCategory = "INTERNAL";
      throw error;
    } finally {
      clearTimeout(timeout);
      metrics.totalMs = elapsedMs(metrics.startedAt);

      try {
        this.options.metricsLogger(metrics, this.provider.model);
      } catch {
        // Metrics must never change the response or expose an internal error.
      }
    }
  }

  private async runProvider<T>(
    stage: string,
    metrics: AiRequestMetrics,
    operation: () => Promise<T>
  ): Promise<T> {
    const startedAt = performance.now();
    metrics.stage = stage;

    try {
      return await operation();
    } catch (error) {
      if (error instanceof AiProviderError && error.code === "TIMEOUT") {
        metrics.timeoutStage = stage;
      }

      throw error;
    } finally {
      metrics.providerMs.push(elapsedMs(startedAt));

      if (metrics.stage === stage) {
        metrics.stage = null;
      }
    }
  }

  private async runDatabaseOperation<T>(
    stage: string,
    metrics: AiRequestMetrics,
    operation: () => Promise<T>
  ): Promise<T> {
    const startedAt = performance.now();
    metrics.stage = stage;

    try {
      return await operation();
    } finally {
      metrics.databaseMs.push(elapsedMs(startedAt));

      if (metrics.stage === stage) {
        metrics.stage = null;
      }
    }
  }

  private assertWithinBudget(
    abortController: AbortController,
    metrics: AiRequestMetrics
  ): void {
    if (!abortController.signal.aborted) {
      return;
    }

    metrics.timeoutStage = metrics.timeoutStage ?? metrics.stage ?? "finalization";
    throw new AiProviderError("TIMEOUT", "The AI request timed out.");
  }

  /**
   * Re-fetches the client's cart lines from the public catalog. Only ids and
   * quantities are trusted; price, stock, seller, and availability come from
   * the database. An id that is no longer publicly sellable rejects the whole
   * request rather than trusting a partial cart.
   */
  private async loadCartContext(
    cart: AiCartInput | undefined,
    metrics: AiRequestMetrics
  ): Promise<AiCartContext | null> {
    if (!cart) {
      return null;
    }

    let products: AiCartProduct[];

    try {
      products = await this.runDatabaseOperation("catalog:cart", metrics, () =>
        this.catalog.findCartItems(cart.items.map((item) => item.medicineId))
      );
    } catch (error) {
      console.error("[ai] cart load failed", {
        error: error instanceof Error ? error.name : "unknown",
      });

      throw new AppError(
        status.SERVICE_UNAVAILABLE,
        "The AI assistant could not read your cart. Please try again."
      );
    }

    const context = buildCartContext(cart.items, products);

    if (!context) {
      throw new AppError(
        status.BAD_REQUEST,
        "Your cart includes a medicine that is no longer available in the catalog. Remove it from your cart and try again."
      );
    }

    return context;
  }

  private async loadCartProducts(
    medicineIds: string[],
    metrics: AiRequestMetrics
  ): Promise<AiCartProduct[] | null> {
    if (medicineIds.length === 0) {
      return [];
    }

    try {
      return await this.runDatabaseOperation("catalog:cart", metrics, () =>
        this.catalog.findCartItems(medicineIds)
      );
    } catch (error) {
      metrics.errorCategory = "CATALOG";
      console.error("[ai] cart verification failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }
  }

  /**
   * Validates a model-proposed cart action against the verified cart context
   * and the freshly re-fetched final cart, then builds either a confirmable
   * proposal or a deterministic conflict answer. Never mutates anything.
   */
  private async buildCartOutcome(
    data: TFinalizeResponseArgs,
    cart: AiCartContext | null,
    allowedMedicineIds: ReadonlySet<string>,
    toolCalls: number,
    abortController: AbortController,
    metrics: AiRequestMetrics
  ): Promise<
    | { kind: "retry"; conflict: AiCartConflict }
    | { kind: "result"; result: AiShoppingChatResult }
  > {
    const finalizationStartedAt = performance.now();
    const finishResult = (result: AiShoppingChatResult) => {
      metrics.finalizationMs = elapsedMs(finalizationStartedAt);

      return { kind: "result" as const, result };
    };

    if (!cart) {
      return finishResult(
        this.buildCartConflictResult(
          buildCartConflict("CART_UNAVAILABLE"),
          toolCalls
        )
      );
    }

    if (data.cartAction && data.cartSummary) {
      return { kind: "retry", conflict: buildCartConflict("INVALID_ACTION") };
    }

    if (data.cartSummary) {
      return finishResult(
        this.buildCartSummaryResult(buildCartSummary(cart), toolCalls)
      );
    }

    if (!data.cartAction) {
      return { kind: "retry", conflict: buildCartConflict("INVALID_ACTION") };
    }

    const plan = planCartAction(data.cartAction, cart, allowedMedicineIds);

    if (plan.kind === "retry") {
      return { kind: "retry", conflict: plan.conflict };
    }

    if (plan.kind === "rejected") {
      return finishResult(
        this.buildCartConflictResult(plan.conflict, toolCalls)
      );
    }

    const finalIds = Array.from(plan.finalQuantities.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([medicineId]) => medicineId);
    const freshProducts = await this.loadCartProducts(finalIds, metrics);

    if (!freshProducts) {
      return finishResult(this.buildFallbackResult(toolCalls, metrics));
    }

    const verification = verifyFinalCart({
      cart,
      changes: plan.changes,
      finalQuantities: plan.finalQuantities,
      freshProducts,
    });

    this.assertWithinBudget(abortController, metrics);

    if (verification.conflict) {
      return finishResult(
        this.buildCartConflictResult(verification.conflict, toolCalls)
      );
    }

    const proposal = buildCartProposal(
      plan.action,
      plan.changes,
      cart.fingerprint,
      verification.snapshots
    );

    if (!proposal) {
      return finishResult(
        this.buildCartConflictResult(
          buildCartConflict("PRODUCT_UNAVAILABLE"),
          toolCalls
        )
      );
    }

    return finishResult(this.buildCartProposalResult(proposal, toolCalls));
  }

  private buildCartProposalResult(
    proposal: AiCartProposal,
    toolCalls: number
  ): AiShoppingChatResult {
    return {
      answer: buildCartProposalAnswer(proposal),
      products: [],
      cart: { proposal },
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: false,
      },
    };
  }

  private buildCartConflictResult(
    conflict: AiCartConflict,
    toolCalls: number
  ): AiShoppingChatResult {
    return {
      answer: conflict.message,
      products: [],
      cart: { conflict },
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: false,
      },
    };
  }

  private buildCartSummaryResult(
    summary: AiCartSummary,
    toolCalls: number
  ): AiShoppingChatResult {
    return {
      answer: buildCartSummaryAnswer(summary),
      products: [],
      cart: { summary },
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: false,
      },
    };
  }

  private async buildFinalizedResult(
    data: TFinalizeResponseArgs,
    seenProductIds: Set<string>,
    toolCalls: number,
    abortController: AbortController,
    metrics: AiRequestMetrics
  ): Promise<AiShoppingChatResult> {
    const finalizationStartedAt = performance.now();
    const requestedProductIds = Array.from(new Set(data.productIds)).slice(
      0,
      AI_MAX_PRODUCT_IDS
    );
    const allowedProductIds = requestedProductIds.filter((productId) =>
      seenProductIds.has(productId)
    );
    const products = await this.tryHydrate(allowedProductIds, metrics);

    metrics.finalizationMs = elapsedMs(finalizationStartedAt);
    this.assertWithinBudget(abortController, metrics);

    if (!products) {
      return this.buildFallbackResult(toolCalls, metrics);
    }

    if (products.length === 0) {
      // A finalize that cited only ungrounded or no-longer-public products is a
      // grounding failure, not a valid "no match" answer.
      return this.buildNoMatchResult(toolCalls, requestedProductIds.length > 0);
    }

    return {
      answer: buildGroundedAnswer(products),
      products,
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: false,
      },
    };
  }

  private async buildGroundedResult(
    seenProductIds: Set<string>,
    toolCalls: number,
    abortController: AbortController,
    metrics: AiRequestMetrics
  ): Promise<AiShoppingChatResult> {
    const finalizationStartedAt = performance.now();
    const productIds = Array.from(seenProductIds).slice(0, AI_MAX_PRODUCT_IDS);
    const products = await this.tryHydrate(productIds, metrics);

    metrics.finalizationMs = elapsedMs(finalizationStartedAt);
    this.assertWithinBudget(abortController, metrics);

    if (!products) {
      return this.buildFallbackResult(toolCalls, metrics);
    }

    if (products.length === 0) {
      return this.buildNoMatchResult(toolCalls, seenProductIds.size > 0);
    }

    return {
      answer: buildGroundedAnswer(products),
      products,
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: false,
      },
    };
  }

  private async buildTextResult(
    turn: AiTurn,
    seenProductIds: Set<string>,
    toolCalls: number,
    abortController: AbortController,
    metrics: AiRequestMetrics
  ): Promise<AiShoppingChatResult> {
    const finalizationStartedAt = performance.now();
    const productIds = Array.from(seenProductIds).slice(0, AI_MAX_PRODUCT_IDS);
    const products = await this.tryHydrate(productIds, metrics);

    metrics.finalizationMs = elapsedMs(finalizationStartedAt);
    this.assertWithinBudget(abortController, metrics);

    if (!products) {
      return this.buildFallbackResult(toolCalls, metrics);
    }

    if (products.length > 0) {
      return {
        answer: buildGroundedAnswer(products),
        products,
        meta: {
          model: this.provider.model,
          toolCalls,
          fallback: false,
        },
      };
    }

    if (seenProductIds.size > 0) {
      return this.buildNoMatchResult(toolCalls, true);
    }

    if (!isSafeAssistantText(turn.text)) {
      return this.buildSafeResponseResult(toolCalls);
    }

    return {
      answer: turn.text.trim(),
      products: [],
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: false,
      },
    };
  }

  private async tryHydrate(
    productIds: string[],
    metrics: AiRequestMetrics
  ): Promise<AiMedicineCard[] | null> {
    if (productIds.length === 0) {
      return [];
    }

    try {
      return await this.runDatabaseOperation("catalog:hydrate", metrics, () =>
        this.catalog.hydrate(productIds)
      );
    } catch (error) {
      metrics.errorCategory = "CATALOG";
      console.error("[ai] catalog hydration failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }
  }

  private buildNoMatchResult(
    toolCalls: number,
    fallback: boolean
  ): AiShoppingChatResult {
    return {
      answer: AI_NO_MATCH_MESSAGE,
      products: [],
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback,
      },
    };
  }

  private buildSafeResponseResult(toolCalls: number): AiShoppingChatResult {
    return {
      answer: AI_SAFE_RESPONSE_MESSAGE,
      products: [],
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: true,
      },
    };
  }

  private buildFallbackResult(
    toolCalls: number,
    metrics: AiRequestMetrics
  ): AiShoppingChatResult {
    metrics.fallback = true;

    return {
      answer: AI_FALLBACK_MESSAGE,
      products: [],
      meta: {
        model: this.provider.model,
        toolCalls,
        fallback: true,
      },
    };
  }
}

let defaultService: AiShoppingChatService | null = null;

const getDefaultService = (): AiShoppingChatService => {
  if (!defaultService) {
    defaultService = new AiShoppingChatService(new GeminiAiProvider());
  }

  return defaultService;
};

export const AiShoppingService: ShoppingChatService = {
  chat: (input) => getDefaultService().chat(input),
};
