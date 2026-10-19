import { performance } from "node:perf_hooks";

/**
 * Internal, privacy-safe request metrics. This deliberately contains no
 * prompts, customer messages, product ids, catalog rows, or provider payloads.
 */
export interface AiRequestMetrics {
  startedAt: number;
  totalMs: number;
  providerMs: number[];
  databaseMs: number[];
  toolRounds: number;
  toolCalls: number;
  finalizationMs: number;
  timeoutStage: string | null;
  errorCategory: string | null;
  stage: string | null;
  fallback: boolean;
}

export const createAiRequestMetrics = (): AiRequestMetrics => {
  return {
    startedAt: performance.now(),
    totalMs: 0,
    providerMs: [],
    databaseMs: [],
    toolRounds: 0,
    toolCalls: 0,
    finalizationMs: 0,
    timeoutStage: null,
    errorCategory: null,
    stage: null,
    fallback: false,
  };
};

export const elapsedMs = (startedAt: number): number => {
  return Math.max(0, Math.round(performance.now() - startedAt));
};

export const toAiMetricsLog = (metrics: AiRequestMetrics, model: string) => {
  return {
    event: "ai.shopping.chat",
    model,
    totalMs: metrics.totalMs,
    providerCalls: metrics.providerMs.length,
    providerMs: [...metrics.providerMs],
    databaseQueries: metrics.databaseMs.length,
    databaseMs: [...metrics.databaseMs],
    toolRounds: metrics.toolRounds,
    toolCalls: metrics.toolCalls,
    finalizationMs: metrics.finalizationMs,
    timeoutStage: metrics.timeoutStage,
    errorCategory: metrics.errorCategory,
    fallback: metrics.fallback,
  };
};

export const logAiMetrics = (
  metrics: AiRequestMetrics,
  model: string
): void => {
  // Keep unit tests quiet; the payload itself is still covered by tests.
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.info("[ai] shopping-chat metrics", JSON.stringify(toAiMetricsLog(metrics, model)));
};
