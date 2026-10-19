import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import globalErrorHandler from "../src/app/middleware/globalErrorHandler";
import { createAiShoppingRouter } from "../src/app/modules/ai/ai.route";
import type {
  AiShoppingChatInput,
  AiShoppingChatResult,
} from "../src/app/modules/ai/ai.types";
import type { ShoppingChatService } from "../src/app/modules/ai/ai.service";
import { createCard } from "./ai.test-helpers";

const createTestApp = (service: ShoppingChatService, options: {
  enabled?: boolean;
  rateLimitMax?: number;
} = {}) => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/ai/shopping",
    createAiShoppingRouter({
      service,
      enabled: options.enabled ?? true,
      rateLimitMax: options.rateLimitMax ?? 100,
    })
  );
  app.use(globalErrorHandler);
  return app;
};

const createService = () => {
  const chat = vi.fn(async (_input: AiShoppingChatInput): Promise<AiShoppingChatResult> => {
    return {
      answer: "I found a safe option.",
      products: [createCard()],
      meta: {
        model: "test-gemini-model",
        toolCalls: 2,
        fallback: false,
      },
    };
  });

  return {
    chat,
    service: { chat } satisfies ShoppingChatService,
  };
};

describe("POST /api/v1/ai/shopping/chat", () => {
  it("returns the grounded answer, products, and metadata", async () => {
    const { service } = createService();
    const response = await request(createTestApp(service))
      .post("/api/v1/ai/shopping/chat")
      .send({ message: "Do you have Napa?" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "AI shopping response generated successfully",
      data: {
        answer: "I found a safe option.",
        products: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Napa 500",
            price: 12.5,
            stockStatus: "LOW_STOCK",
          },
        ],
        meta: {
          model: "test-gemini-model",
          toolCalls: 2,
          fallback: false,
        },
      },
    });
  });

  it("rejects invalid request bodies before calling the model", async () => {
    const { service, chat } = createService();
    const response = await request(createTestApp(service))
      .post("/api/v1/ai/shopping/chat")
      .send({ message: "   " });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });

  it("caps the supplied conversation history", async () => {
    const { service, chat } = createService();
    const response = await request(createTestApp(service))
      .post("/api/v1/ai/shopping/chat")
      .send({
        message: "What about another option?",
        history: Array.from({ length: 7 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `History message ${index + 1}`,
        })),
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });

  it("is disabled by default by the AI_ENABLED flag", async () => {
    const { service, chat } = createService();
    const app = express();
    app.use(express.json());
    app.use(
      "/api/v1/ai/shopping",
      createAiShoppingRouter({ service, rateLimitMax: 100 })
    );
    app.use(globalErrorHandler);

    const response = await request(app)
      .post("/api/v1/ai/shopping/chat")
      .send({ message: "hello" });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });

  it("limits each client to the configured request count", async () => {
    const { service } = createService();
    const app = createTestApp(service, { rateLimitMax: 1 });

    const first = await request(app)
      .post("/api/v1/ai/shopping/chat")
      .send({ message: "first" });
    const second = await request(app)
      .post("/api/v1/ai/shopping/chat")
      .send({ message: "second" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({
      success: false,
      statusCode: 429,
    });
  });
});
