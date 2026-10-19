import { describe, expect, it } from "vitest";

import {
  createAiRequestMetrics,
  elapsedMs,
  toAiMetricsLog,
} from "../src/app/modules/ai/ai.metrics";

describe("AI request metrics", () => {
  it("creates empty counters", () => {
    const metrics = createAiRequestMetrics();

    expect(metrics.providerMs).toEqual([]);
    expect(metrics.databaseMs).toEqual([]);
    expect(metrics.toolRounds).toBe(0);
    expect(metrics.toolCalls).toBe(0);
    expect(metrics.timeoutStage).toBeNull();
    expect(metrics.errorCategory).toBeNull();
    expect(metrics.fallback).toBe(false);
    expect(elapsedMs(metrics.startedAt)).toBeGreaterThanOrEqual(0);
  });

  it("logs only sanitized stage, duration, and error metadata", () => {
    const metrics = createAiRequestMetrics();
    metrics.totalMs = 1_234;
    metrics.providerMs = [800, 200];
    metrics.databaseMs = [12, 7];
    metrics.toolRounds = 1;
    metrics.toolCalls = 2;
    metrics.finalizationMs = 5;
    metrics.timeoutStage = "provider:tool-results";
    metrics.errorCategory = "TIMEOUT";
    metrics.fallback = true;

    const log = toAiMetricsLog(metrics, "gemini-test-model");
    const serialized = JSON.stringify(log);

    expect(log).toMatchObject({
      event: "ai.shopping.chat",
      model: "gemini-test-model",
      totalMs: 1_234,
      providerCalls: 2,
      databaseQueries: 2,
      toolRounds: 1,
      toolCalls: 2,
      finalizationMs: 5,
      timeoutStage: "provider:tool-results",
      errorCategory: "TIMEOUT",
      fallback: true,
    });
    expect(serialized).not.toContain("Napa");
    expect(serialized).not.toContain("Do you have");
    expect(serialized).not.toContain("api-key");
  });
});
