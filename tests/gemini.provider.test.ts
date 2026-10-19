import { beforeEach, describe, expect, it, vi } from "vitest";

const gemini = vi.hoisted(() => ({
  generateContent: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock("@google/genai", () => {
  class GoogleGenAI {
    public readonly models = {
      generateContent: gemini.generateContent,
    };

    constructor(options: unknown) {
      gemini.constructor(options);
    }
  }

  return { GoogleGenAI };
});

import { GeminiAiProvider } from "../src/app/modules/ai/providers/gemini.provider";

const createProvider = () =>
  new GeminiAiProvider({
    apiKey: "test-key",
    model: "gemini-test-model",
    timeoutMs: 5_000,
  });

const firstResponse = {
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          { text: "Let me search the catalog." },
          {
            functionCall: {
              id: "call-1",
              name: "searchMedicines",
              args: { query: "napa" },
            },
            thoughtSignature: "thought-signature-1",
          },
        ],
      },
    },
  ],
  text: "Let me search the catalog.",
  functionCalls: [
    {
      id: "call-1",
      name: "searchMedicines",
      args: { query: "napa" },
    },
  ],
};

const secondResponse = {
  candidates: [
    {
      content: {
        role: "model",
        parts: [{ text: "Napa is available." }],
      },
    },
  ],
  text: "Napa is available.",
  functionCalls: [],
};

const snapshot = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("GeminiAiProvider", () => {
  beforeEach(() => {
    gemini.generateContent.mockReset();
    gemini.constructor.mockReset();
  });

  it("disables automatic function calling and preserves thought signatures and call ids", async () => {
    const sentContents: unknown[] = [];

    gemini.generateContent
      .mockImplementationOnce(async (input: { contents: unknown }) => {
        sentContents.push(snapshot(input.contents));
        return firstResponse;
      })
      .mockImplementationOnce(async (input: { contents: unknown }) => {
        sentContents.push(snapshot(input.contents));
        return secondResponse;
      });

    const provider = createProvider();
    const controller = new AbortController();
    const session = provider.createChat({
      systemInstruction: "Test system prompt",
      tools: [
        {
          name: "searchMedicines",
          description: "Search medicines",
          parametersJsonSchema: { type: "object" },
        },
      ],
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      signal: controller.signal,
    });

    const firstTurn = await session.sendUserMessage("Find Napa");
    const firstRequest = gemini.generateContent.mock.calls[0]?.[0] as {
      model: string;
      contents: unknown;
      config: Record<string, unknown>;
    };

    expect(gemini.constructor).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(firstTurn).toMatchObject({
      text: "Let me search the catalog.",
      functionCalls: [
        {
          id: "call-1",
          name: "searchMedicines",
          args: { query: "napa" },
        },
      ],
    });
    expect(firstRequest.model).toBe("gemini-test-model");
    expect(firstRequest.config).toMatchObject({
      systemInstruction: "Test system prompt",
      automaticFunctionCalling: { disable: true },
      httpOptions: { timeout: 5_000 },
      abortSignal: controller.signal,
      tools: [
        {
          functionDeclarations: [
            {
              name: "searchMedicines",
              description: "Search medicines",
              parametersJsonSchema: { type: "object" },
            },
          ],
        },
      ],
    });
    expect(sentContents[0]).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello" }] },
      { role: "user", parts: [{ text: "Find Napa" }] },
    ]);

    const secondTurn = await session.sendToolResults([
      {
        name: "searchMedicines",
        id: "call-1",
        response: { products: [] },
      },
    ]);

    expect(secondTurn).toMatchObject({
      text: "Napa is available.",
      functionCalls: [],
    });
    expect(sentContents[1]).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello" }] },
      { role: "user", parts: [{ text: "Find Napa" }] },
      {
        role: "model",
        parts: [
          { text: "Let me search the catalog." },
          {
            functionCall: {
              id: "call-1",
              name: "searchMedicines",
              args: { query: "napa" },
            },
            thoughtSignature: "thought-signature-1",
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "searchMedicines",
              id: "call-1",
              response: { products: [] },
            },
          },
        ],
      },
    ]);
  });

  it("maps provider quota failures to a safe provider error", async () => {
    gemini.generateContent.mockRejectedValueOnce(
      Object.assign(new Error("quota exceeded"), { status: 429 })
    );

    const provider = createProvider();
    const session = provider.createChat({
      systemInstruction: "Test system prompt",
      tools: [],
      history: [],
    });

    await expect(session.sendUserMessage("hello")).rejects.toMatchObject({
      name: "AiProviderError",
      code: "QUOTA",
    });
  });
});
