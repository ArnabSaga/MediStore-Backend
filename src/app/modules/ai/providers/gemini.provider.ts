import {
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";

import { envVars } from "../../../config/env";
import { AiProviderError } from "../ai.errors";
import type {
  AiChatOptions,
  AiChatSession,
  AiProvider,
  AiTurn,
  AiHistoryMessage,
} from "../ai.types";

const toContent = (message: AiHistoryMessage): Content => {
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content.trim() }],
  };
};

const appendContent = (contents: Content[], content: Content): void => {
  const lastContent = contents[contents.length - 1];

  if (lastContent && lastContent.role === content.role) {
    lastContent.parts = [...(lastContent.parts ?? []), ...(content.parts ?? [])];
    return;
  }

  contents.push(content);
};

const buildHistory = (history: AiHistoryMessage[]): Content[] => {
  const contents: Content[] = [];

  for (const message of history) {
    if (!message.content.trim()) {
      continue;
    }

    appendContent(contents, toContent(message));
  }

  // A model turn cannot be the first content in a Gemini conversation.
  while (contents[0]?.role === "model") {
    contents.shift();
  }

  return contents;
};

const createConfig = (
  options: AiChatOptions,
  timeoutMs: number
): GenerateContentConfig => {
  return {
    systemInstruction: options.systemInstruction,
    temperature: 0.2,
    maxOutputTokens: 1_500,
    tools: [
      {
        functionDeclarations: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parametersJsonSchema: tool.parametersJsonSchema,
        })),
      },
    ],
    automaticFunctionCalling: {
      disable: true,
    },
    httpOptions: {
      timeout: timeoutMs,
    },
    abortSignal: options.signal,
  };
};

const classifyError = (error: unknown): AiProviderError => {
  if (error instanceof AiProviderError) {
    return error;
  }

  const providerError = error as {
    name?: string;
    message?: string;
    status?: number;
    code?: string | number;
  };
  const name = providerError?.name ?? "";
  const message = providerError?.message ?? "";

  if (
    name === "AbortError" ||
    name === "RequestTimeoutError" ||
    providerError?.code === "ABORT_ERR" ||
    /abort|timed?\s*out|timeout/i.test(message) ||
    providerError?.status === 504
  ) {
    return new AiProviderError("TIMEOUT", "The AI provider timed out.");
  }

  if (providerError?.status === 429) {
    return new AiProviderError("QUOTA", "The AI provider quota was exceeded.");
  }

  return new AiProviderError("UNAVAILABLE", "The AI provider is unavailable.");
};

class GeminiChatSession implements AiChatSession {
  private readonly contents: Content[];

  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
    private readonly config: GenerateContentConfig,
    history: AiHistoryMessage[]
  ) {
    this.contents = buildHistory(history);
  }

  async sendUserMessage(message: string): Promise<AiTurn> {
    appendContent(this.contents, {
      role: "user",
      parts: [{ text: message.trim() }],
    });

    return this.generate();
  }

  async sendToolResults(
    results: { name: string; id?: string; response: Record<string, unknown> }[]
  ): Promise<AiTurn> {
    const parts: Part[] = results.map((result) => ({
      functionResponse: {
        name: result.name,
        ...(result.id ? { id: result.id } : {}),
        response: result.response,
      },
    }));

    appendContent(this.contents, {
      role: "user",
      parts,
    });

    return this.generate();
  }

  private async generate(): Promise<AiTurn> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.contents,
        config: this.config,
      });

      const modelContent = response.candidates?.[0]?.content;

      // Preserve the complete model content, including thought signatures and
      // function-call ids, so the next request remains valid.
      if (modelContent) {
        this.contents.push(modelContent);
      }

      return {
        text: response.text?.trim() || undefined,
        functionCalls:
          response.functionCalls?.map((call) => ({
            id: call.id,
            name: call.name ?? "",
            args: call.args,
          })) ?? [],
      };
    } catch (error) {
      throw classifyError(error);
    }
  }
}

export class GeminiAiProvider implements AiProvider {
  public readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly timeoutMs: number;

  constructor(options?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    const apiKey = options?.apiKey ?? envVars.GEMINI_API_KEY;
    const model = options?.model ?? envVars.GEMINI_MODEL;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required when AI_ENABLED=true.");
    }

    if (!model) {
      throw new Error("GEMINI_MODEL is required when AI_ENABLED=true.");
    }

    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
    this.timeoutMs = options?.timeoutMs ?? envVars.AI_TIMEOUT_MS;
  }

  createChat(options: AiChatOptions): AiChatSession {
    return new GeminiChatSession(
      this.client,
      this.model,
      createConfig(options, this.timeoutMs),
      options.history
    );
  }
}
