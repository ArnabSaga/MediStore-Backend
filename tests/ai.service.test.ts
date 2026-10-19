import { describe, expect, it } from "vitest";

import { AiProviderError } from "../src/app/modules/ai/ai.errors";
import type { AiRequestMetrics } from "../src/app/modules/ai/ai.metrics";
import { AiShoppingChatService } from "../src/app/modules/ai/ai.service";
import type { AiProvider, AiToolResponse } from "../src/app/modules/ai/ai.types";
import {
  HALLUCINATED_ID,
  MEDICINE_ID,
  MEDICINE_ID_2,
  MISSING_ID,
  OTHER_SELLER_ID,
  createCard,
  createCartProduct,
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

describe("AiShoppingChatService cart proposals", () => {
  const toolResponsesAt = (session: { sendToolResults: unknown }, index: number) => {
    return (
      session.sendToolResults as unknown as {
        mock: { calls: [AiToolResponse[]][] };
      }
    ).mock.calls[index][0];
  };

  const aceCard = createCard({
    id: MEDICINE_ID_2,
    name: "Ace 500",
    slug: "ace-500",
    manufacturer: "Square",
    price: 8.75,
    stock: 50,
    stockStatus: "IN_STOCK",
  });

  const aceCartProduct = createCartProduct({
    id: MEDICINE_ID_2,
    name: "Ace 500",
    slug: "ace-500",
    manufacturer: "Square",
    price: 8.75,
    stock: 50,
  });

  it("proposes a quantity change with a fingerprint of the sent cart and applies nothing", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider, session, createChat } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Updating the quantity.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 3 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Make it three",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    expect(createChat).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining(`id ${MEDICINE_ID}`),
      })
    );
    expect(result.products).toEqual([]);
    expect(result.meta).toEqual({
      model: "test-gemini-model",
      toolCalls: 1,
      fallback: false,
    });
    expect(result.cart?.proposal).toMatchObject({
      action: "SET_QTY",
      cartFingerprint: `${MEDICINE_ID}:1`,
      items: [
        {
          medicineId: MEDICINE_ID,
          previousQuantity: 1,
          quantity: 3,
          name: "Napa 500",
          price: 12.5,
          seller: napa.seller,
        },
      ],
    });
    expect(result.answer).toContain("set Napa 500 - quantity 3");
    expect(result.answer).toContain("Nothing changes until you confirm");
    expect(session.sendToolResults).not.toHaveBeenCalled();
    expect(catalog.findCartItems).toHaveBeenNthCalledWith(1, [MEDICINE_ID]);
    expect(catalog.findCartItems).toHaveBeenNthCalledWith(2, [MEDICINE_ID]);
  });

  it("searches first, then proposes adding a new medicine for confirmation", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([aceCard]);
    catalog.findCartItems.mockResolvedValue([napa, aceCartProduct]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "ace" },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Adding Ace 500.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID_2, quantity: 1 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Add Ace 500 to my cart",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    // The search fast path is skipped whenever a cart snapshot is attached so
    // the model can ground the cart action on fresh search results.
    expect(session.sendToolResults).toHaveBeenCalledTimes(1);
    expect(result.meta.toolCalls).toBe(2);
    expect(result.cart?.proposal).toMatchObject({
      action: "SET_QTY",
      items: [
        {
          medicineId: MEDICINE_ID_2,
          previousQuantity: 0,
          quantity: 1,
        },
      ],
    });
    expect(result.answer).toContain("add Ace 500 - quantity 1");
  });

  it("proposes a removal when the model sets quantity zero", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Removing Napa 500.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 0 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Remove Napa 500",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 2 }] },
    });

    expect(result.cart?.proposal).toMatchObject({
      action: "SET_QTY",
      items: [{ medicineId: MEDICINE_ID, previousQuantity: 2, quantity: 0 }],
    });
    expect(result.answer).toContain("remove Napa 500");
    // A removal never needs a second catalog read: nothing is left to verify.
    expect(catalog.findCartItems).toHaveBeenCalledTimes(1);
  });

  it("proposes clearing the cart with a single confirmation step", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa, aceCartProduct]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Clearing the cart.",
              productIds: [],
              cartAction: { action: "CLEAR", items: [] },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Empty my cart",
      cart: {
        items: [
          { medicineId: MEDICINE_ID, quantity: 1 },
          { medicineId: MEDICINE_ID_2, quantity: 2 },
        ],
      },
    });

    expect(result.cart?.proposal).toMatchObject({
      action: "CLEAR",
      items: [
        { medicineId: MEDICINE_ID, previousQuantity: 1, quantity: 0 },
        { medicineId: MEDICINE_ID_2, previousQuantity: 2, quantity: 0 },
      ],
    });
    expect(result.answer).toContain("empty your MediStore cart");
    expect(result.answer).toContain("Confirm");
    expect(catalog.findCartItems).toHaveBeenCalledTimes(1);
  });

  it("rejects an increase beyond fresh stock with a conflict answer", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems
      .mockResolvedValueOnce([napa])
      .mockResolvedValueOnce([{ ...napa, stock: 2 }]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Setting the quantity to five.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 5 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Make it five",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    expect(result.products).toEqual([]);
    expect(result.cart?.conflict).toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
    expect(result.cart?.proposal).toBeUndefined();
    expect(result.meta.fallback).toBe(false);
    expect(result.answer).toContain("enough stock");
  });

  it("rejects a mixed-seller proposal without changing the cart", async () => {
    const napa = createCartProduct();
    const otherAce = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      seller: { id: OTHER_SELLER_ID, name: "Health Mart", image: null },
    });
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([
      createCard({
        id: MEDICINE_ID_2,
        name: "Ace 500",
        seller: { id: OTHER_SELLER_ID, name: "Health Mart", image: null },
      }),
    ]);
    catalog.findCartItems.mockResolvedValue([napa, otherAce]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "ace" },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Adding Ace 500.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID_2, quantity: 1 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Add Ace 500",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    expect(result.cart?.conflict).toMatchObject({ code: "SINGLE_SELLER" });
    expect(result.cart?.proposal).toBeUndefined();
    expect(result.answer).toContain("one seller");
  });

  it("allows removing an item from an already-mixed cart", async () => {
    const napa = createCartProduct();
    const otherAce = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      seller: { id: OTHER_SELLER_ID, name: "Health Mart", image: null },
    });
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa, otherAce]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Removing Napa 500.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 0 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Remove Napa 500 so I have one seller",
      cart: {
        items: [
          { medicineId: MEDICINE_ID, quantity: 1 },
          { medicineId: MEDICINE_ID_2, quantity: 1 },
        ],
      },
    });

    expect(result.cart?.conflict).toBeUndefined();
    expect(result.cart?.proposal).toMatchObject({
      action: "SET_QTY",
      items: [{ medicineId: MEDICINE_ID, previousQuantity: 1, quantity: 0 }],
    });
  });

  it("returns a retryable error for an ungrounded id and lets the model recover", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Changing an invented medicine.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: HALLUCINATED_ID, quantity: 1 }],
              },
            },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Updating Napa 500.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 2 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Set the made-up medicine to one",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    expect(toolResponsesAt(session, 0)[0].response).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITEM" },
    });
    expect(result.meta.toolCalls).toBe(2);
    expect(result.cart?.proposal).toMatchObject({
      action: "SET_QTY",
      items: [{ medicineId: MEDICINE_ID, previousQuantity: 1, quantity: 2 }],
    });
  });

  it("returns a retryable error for a malformed action and lets the model recover", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Changing nothing specific.",
              productIds: [],
              cartAction: { action: "SET_QTY", items: [] },
            },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Clearing the cart.",
              productIds: [],
              cartAction: { action: "CLEAR", items: [] },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Clear it",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    expect(toolResponsesAt(session, 0)[0].response).toMatchObject({
      ok: false,
      error: { code: "INVALID_ACTION" },
    });
    expect(result.cart?.proposal).toMatchObject({ action: "CLEAR" });
  });

  it("treats a combined action and summary as a retryable error", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider, session } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Doing two things at once.",
              productIds: [],
              cartAction: { action: "CLEAR", items: [] },
              cartSummary: true,
            },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Here is your cart.",
              productIds: [],
              cartSummary: true,
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "What is in my cart?",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 3 }] },
    });

    expect(toolResponsesAt(session, 0)[0].response).toMatchObject({
      ok: false,
      error: { code: "INVALID_ACTION" },
    });
    expect(result.cart?.summary).toMatchObject({
      totalItems: 3,
      singleSeller: true,
      items: [
        expect.objectContaining({ medicineId: MEDICINE_ID, quantity: 3 }),
      ],
    });
  });

  it("answers cart questions from the verified snapshot without proposing changes", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Here is your cart.",
              productIds: [],
              cartSummary: true,
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "What is in my cart?",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 3 }] },
    });

    expect(result.cart?.proposal).toBeUndefined();
    expect(result.cart?.conflict).toBeUndefined();
    expect(result.cart?.summary?.totalItems).toBe(3);
    expect(result.answer).toContain("quantity 3");
    expect(result.answer).toContain("Nothing in your cart was changed");
  });

  it("reports no change when the proposed quantity already matches", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([napa]);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Setting it to two.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 2 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Set Napa to two",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 2 }] },
    });

    expect(result.cart?.conflict).toMatchObject({ code: "NO_CHANGE" });
    expect(result.answer).toContain("wouldn't make a difference");
  });

  it("enforces the cart item limit before proposing a final cart", async () => {
    const products = Array.from({ length: 21 }, (_, index) =>
      createCartProduct({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        name: `Medicine ${index}`,
      })
    );
    const catalog = createCatalogMock();
    catalog.search.mockResolvedValue([
      createCard({ id: products[20].id, name: products[20].name }),
    ]);
    catalog.findCartItems.mockResolvedValue(products);

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "searchMedicines",
            args: { query: "medicine 20" },
          },
        ],
      },
      {
        functionCalls: [
          {
            id: "call-2",
            name: "finalizeResponse",
            args: {
              answer: "Adding one more.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: products[20].id, quantity: 1 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Add one more medicine",
      cart: {
        items: products.slice(0, 20).map((product) => ({
          medicineId: product.id,
          quantity: 1,
        })),
      },
    });

    expect(result.cart?.conflict).toMatchObject({ code: "CART_LIMIT" });
    expect(result.answer).toContain("20 medicines");
    expect(catalog.findCartItems).toHaveBeenCalledTimes(1);
  });

  it("rejects a cart with a medicine that is no longer public", async () => {
    const catalog = createCatalogMock();
    catalog.findCartItems.mockResolvedValue([]);
    const metrics: AiRequestMetrics[] = [];
    const { provider, createChat } = createScriptedProvider([]);

    const service = createService(provider, catalog, {
      metricsLogger: (requestMetrics) => metrics.push(requestMetrics),
    });

    await expect(
      service.chat({
        message: "Change my cart",
        cart: { items: [{ medicineId: MISSING_ID, quantity: 1 }] },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("no longer available"),
    });

    expect(createChat).not.toHaveBeenCalled();
    expect(metrics[0].errorCategory).toBe("CLIENT");
  });

  it("returns a graceful service error when the cart cannot be loaded", async () => {
    const catalog = createCatalogMock();
    catalog.findCartItems.mockRejectedValue(new Error("database connection details"));
    const metrics: AiRequestMetrics[] = [];
    const { provider } = createScriptedProvider([]);

    const service = createService(provider, catalog, {
      metricsLogger: (requestMetrics) => metrics.push(requestMetrics),
    });

    await expect(
      service.chat({
        message: "Change my cart",
        cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
      })
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(metrics[0].errorCategory).toBe("CATALOG");
  });

  it("falls back gracefully when the final cart cannot be verified", async () => {
    const napa = createCartProduct();
    const catalog = createCatalogMock();
    catalog.findCartItems
      .mockResolvedValueOnce([napa])
      .mockRejectedValueOnce(new Error("database connection details"));
    const metrics: AiRequestMetrics[] = [];

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Changing the quantity.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 3 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog, {
      metricsLogger: (requestMetrics) => metrics.push(requestMetrics),
    }).chat({
      message: "Make it three",
      cart: { items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
    });

    expect(result.meta.fallback).toBe(true);
    expect(result.cart).toBeUndefined();
    expect(result.answer).not.toContain("database connection");
    expect(metrics[0].errorCategory).toBe("CATALOG");
  });

  it("answers with a cart conflict when the model proposes an action without a cart", async () => {
    const catalog = createCatalogMock();

    const { provider } = createScriptedProvider([
      {
        functionCalls: [
          {
            id: "call-1",
            name: "finalizeResponse",
            args: {
              answer: "Changing your cart.",
              productIds: [],
              cartAction: {
                action: "SET_QTY",
                items: [{ medicineId: MEDICINE_ID, quantity: 1 }],
              },
            },
          },
        ],
      },
    ]);

    const result = await createService(provider, catalog).chat({
      message: "Add Napa 500",
    });

    expect(result.cart?.conflict).toMatchObject({
      code: "CART_UNAVAILABLE",
    });
    expect(result.meta.fallback).toBe(false);
    expect(catalog.findCartItems).not.toHaveBeenCalled();
  });
});
