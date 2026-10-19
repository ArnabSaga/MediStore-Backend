import { describe, expect, it } from "vitest";

import { AiProviderError } from "../src/app/modules/ai/ai.errors";
import type { AiRequestMetrics } from "../src/app/modules/ai/ai.metrics";
import { AiShoppingChatService } from "../src/app/modules/ai/ai.service";
import type { AiProvider, AiToolResponse } from "../src/app/modules/ai/ai.types";
import {
  HALLUCINATED_ID,
  MEDICINE_ID,
  createCard,
  createCatalogMock,
  createFailingProvider,
  createScriptedProvider,
} from "./ai.test-helpers";

const createService = (
  provider: AiProvider,
  catalog: ReturnType<typeof createCatalogMock>,
  limits: {
    maxToolRounds?: number;
    maxToolCalls?: number;
    timeoutMs?: number;
    fastPath?: boolean;
    metricsLogger?: (metrics: AiRequestMetrics, model: string) => void;
  } = {}
) => {
  return new AiShoppingChatService(provider, catalog, {
    maxToolRounds: limits.maxToolRounds ?? 3,
    maxToolCalls: limits.maxToolCalls ?? 6,
    timeoutMs: limits.timeoutMs ?? 2_000,
    enableSearchFastPath: limits.fastPath ?? true,
    metricsLogger: limits.metricsLogger ?? (() => {}),
  });
};

describe("AiShoppingChatService", () => {
  it("hydrates only products whose ids were returned by tools", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);
    catalog.hydrate.mockResolvedValue([card]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "napa", limit: 5 },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "I found Napa 500.",
              productIds: [card.id, HALLUCINATED_ID],
            },
          },
        ],
      },
    ]);

    const service = createService(provider, catalog, { fastPath: false });
    const result = await service.chat({ message: "Do you have Napa?" });

    expect(result.answer).toContain("Napa 500");
    expect(result.answer).toContain("BDT 12.50");
    expect(result.answer).not.toContain("$");
    expect(result.products).toEqual([card]);
    expect(result.meta).toEqual({
      model: "test-gemini-model",
      toolCalls: 2,
      fallback: false,
    });
    expect(catalog.search).toHaveBeenCalledWith({
      query: "napa",
      category: undefined,
      limit: 5,
    });
    expect(catalog.hydrate).toHaveBeenCalledWith([card.id]);
    expect(session.sendToolResults).toHaveBeenCalledTimes(1);
  });

  it("rejects a details lookup for an id that no tool returned", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "napa" },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "getMedicineDetails",
            args: { medicineId: HALLUCINATED_ID },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-3",
            name: "finalizeResponse",
            args: {
              answer: "I found Napa 500. Please ask for more details.",
              productIds: [card.id],
            },
          },
        ],
      },
    ]);
    catalog.hydrate.mockResolvedValue([card]);

    const result = await createService(provider, catalog, {
      fastPath: false,
    }).chat({
      message: "napa",
    });

    expect(catalog.findDetails).not.toHaveBeenCalled();
    const toolResponses = (session.sendToolResults as unknown as {
      mock: { calls: [AiToolResponse[]][] };
    }).mock.calls[1][0];
    expect(toolResponses[0].response).toMatchObject({
      ok: false,
      error: {
        code: "UNGROUNDED_MEDICINE_ID",
      },
    });
    expect(result.products).toEqual([card]);
  });

  it("rejects a finalize that cites only hallucinated product ids", async () => {
    const catalog = createCatalogMock();
    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "I found Napa One at $2.51, a 500mg equivalent.",
              productIds: [HALLUCINATED_ID],
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Show me a fake medicine",
    });

    expect(result.products).toEqual([]);
    expect(result.meta.fallback).toBe(true);
    expect(result.answer).toContain("couldn't find");
    expect(result.answer).not.toContain("$");
    expect(result.answer).not.toContain("500mg");
    expect(result.answer).not.toContain("equivalent");
    expect(catalog.hydrate).not.toHaveBeenCalled();
  });

  it("rejects invalid tool arguments and lets the model recover", async () => {
    const catalog = createCatalogMock();
    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "napa", limit: "many" },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Please try a more specific medicine name.",
              productIds: [],
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Search napa",
    });

    expect(catalog.search).not.toHaveBeenCalled();
    expect(session.sendToolResults).toHaveBeenCalledTimes(1);

    const toolResponses = (session.sendToolResults as unknown as {
      mock: { calls: [AiToolResponse[]][] };
    }).mock.calls[0][0];
    expect(toolResponses[0].response).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_ARGUMENTS",
      },
    });
    expect(result.answer).toContain("specific medicine");
    expect(result.meta.toolCalls).toBe(2);
  });

  it("stops after the configured number of tool rounds", async () => {
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([createCard()]);
    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          { id: "call-1", name: "searchMedicines", args: { query: "napa" } },
        ],
      },
      {
        functionCalls: [
          { id: "call-2", name: "searchMedicines", args: { query: "napa" } },
        ],
      },
    ]);

    const result = await createService(provider, catalog, {
      maxToolRounds: 1,
      maxToolCalls: 5,
      fastPath: false,
    }).chat({ message: "Search forever" });

    expect(result.meta.fallback).toBe(true);
    expect(result.products).toEqual([]);
    expect(session.sendToolResults).toHaveBeenCalledTimes(1);
  });

  it("maps provider timeouts to a gateway timeout error", async () => {
    const service = createService(
      createFailingProvider(new AiProviderError("TIMEOUT", "provider timeout")),
      createCatalogMock()
    );

    await expect(
      service.chat({ message: "hello" })
    ).rejects.toMatchObject({ statusCode: 504 });
  });

  it("maps provider quota errors to a service unavailable error", async () => {
    const service = createService(
      createFailingProvider(new AiProviderError("QUOTA", "quota reached")),
      createCatalogMock()
    );

    await expect(service.chat({ message: "hello" })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("uses a safe fallback when the model returns no text or tool calls", async () => {
    const { provider } = createScriptedProvider([{ functionCalls: [] }]);
    const result = await createService(provider, createCatalogMock()).chat({
      message: "hello",
    });

    expect(result.meta.fallback).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("finalizes a search-only turn from the database without a second model call", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);
    catalog.hydrate.mockResolvedValue([card]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "napa" },
          },
        ],
      },
    ]);
    const metrics: AiRequestMetrics[] = [];

    const result = await createService(provider, catalog, {
      metricsLogger: (requestMetrics) => metrics.push(requestMetrics),
    }).chat({ message: "Do you have Napa?" });

    expect(session.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(session.sendToolResults).not.toHaveBeenCalled();
    expect(result.answer).toContain("BDT 12.50");
    expect(result.products).toEqual([card]);
    expect(result.meta.fallback).toBe(false);
    expect(result.meta.toolCalls).toBe(1);
    expect(metrics[0].providerMs).toHaveLength(1);
    expect(metrics[0].databaseMs).toHaveLength(2);
    expect(metrics[0].toolCalls).toBe(1);
    expect(metrics[0].finalizationMs).toBeGreaterThanOrEqual(0);
  });

  it("replaces model-authored currency with verified BDT pricing", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);
    catalog.hydrate.mockResolvedValue([card]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          { id: "call-1", name: "searchMedicines", args: { query: "napa" } },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Napa 500 is only $2.51 today.",
              productIds: [card.id],
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog, {
      fastPath: false,
    }).chat({ message: "How much is Napa 500?" });

    expect(result.answer).toContain("BDT 12.50");
    expect(result.answer).not.toContain("$");
    expect(result.answer).not.toContain("2.51");
  });

  it("rejects invented strengths and equivalence claims in model prose", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);
    catalog.hydrate.mockResolvedValue([card]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          { id: "call-1", name: "searchMedicines", args: { query: "napa" } },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer:
                "Napa One is a 500mg equivalent of Napa 500, the same as the branded product.",
              productIds: [card.id],
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog, {
      fastPath: false,
    }).chat({ message: "Is Napa One the same as Napa 500?" });

    expect(result.answer).toContain("Napa 500");
    expect(result.answer).toContain("BDT 12.50");
    expect(result.answer).not.toContain("500mg");
    expect(result.answer).not.toContain("equivalent");
    expect(result.answer).not.toContain("same as");
  });

  it("builds comparisons only from hydrated catalog fields", async () => {
    const napa = createCard();
    const ace = createCard({
      id: "66666666-6666-4666-8666-666666666666",
      name: "Ace 500",
      slug: "ace-500",
      manufacturer: "Square",
      price: 8.75,
      stock: 20,
      stockStatus: "IN_STOCK",
      seller: {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Health Mart",
        image: null,
      },
    });
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([napa, ace]);
    catalog.hydrate.mockResolvedValue([napa, ace]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "napa ace" },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Compare Napa 500 and Ace 500.",
    });

    expect(session.sendToolResults).not.toHaveBeenCalled();
    expect(result.products).toEqual([napa, ace]);
    expect(result.answer).toContain("Napa 500");
    expect(result.answer).toContain("Ace 500");
    expect(result.answer).toContain("BDT 12.50");
    expect(result.answer).toContain("BDT 8.75");
    expect(result.answer).not.toContain("$");
  });

  it("returns a safe fallback when final hydration fails", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);
    catalog.hydrate.mockRejectedValue(new Error("database connection details"));

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          { id: "call-1", name: "searchMedicines", args: { query: "napa" } },
        ],
      },
    ]);
    const metrics: AiRequestMetrics[] = [];

    const result = await createService(provider, catalog, {
      metricsLogger: (requestMetrics) => metrics.push(requestMetrics),
    }).chat({ message: "Do you have Napa?" });

    expect(result.meta.fallback).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.answer).not.toContain("database connection");
    expect(result.answer).toContain("couldn't finish");
    expect(metrics[0].errorCategory).toBe("CATALOG");
    expect(metrics[0].fallback).toBe(true);
  });

  it("rejects unsafe text-only product claims", async () => {
    const { provider } = createScriptedProvider([
      {
        text: "Napa 500 costs $2.51 and is a 500mg equivalent.",
        functionCalls: [],
      },
    ]);

    const result = await createService(provider, createCatalogMock()).chat({
      message: "How much is Napa 500?",
    });

    expect(result.meta.fallback).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.answer).not.toContain("$");
    expect(result.answer).not.toContain("500mg");
    expect(result.answer).not.toContain("equivalent");
  });

  it("records the provider stage and sanitized category on timeout", async () => {
    const metrics: AiRequestMetrics[] = [];
    const service = createService(
      createFailingProvider(new AiProviderError("TIMEOUT", "provider timeout")),
      createCatalogMock(),
      { metricsLogger: (requestMetrics) => metrics.push(requestMetrics) }
    );

    await expect(
      service.chat({ message: "hello" })
    ).rejects.toMatchObject({ statusCode: 504 });
    expect(metrics[0]).toMatchObject({
      errorCategory: "TIMEOUT",
      timeoutStage: "provider:initial",
      fallback: false,
    });
    expect(metrics[0].providerMs).toHaveLength(1);
  });

  it("does not expose a product that a tool never returned", async () => {
    const card = createCard();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([card]);
    catalog.hydrate.mockResolvedValue([card]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "napa" },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Here is one option.",
              productIds: [MEDICINE_ID],
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog, {
      fastPath: false,
    }).chat({
      message: "napa",
    });

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).not.toHaveProperty("seller.email");
    expect(result.products[0]).not.toHaveProperty("seller.phone");
  });
});
