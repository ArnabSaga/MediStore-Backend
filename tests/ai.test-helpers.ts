import { vi } from "vitest";

import type {
  AiChatSession,
  AiHistoryMessage,
  AiMedicineCard,
  AiProvider,
  AiToolResponse,
  AiTurn,
  MedicineCatalog,
} from "../src/app/modules/ai/ai.types";

export const MEDICINE_ID = "11111111-1111-4111-8111-111111111111";
export const HALLUCINATED_ID = "22222222-2222-4222-8222-222222222222";
export const MISSING_ID = "33333333-3333-4333-8333-333333333333";

export const createCard = (overrides: Partial<AiMedicineCard> = {}): AiMedicineCard => {
  return {
    id: MEDICINE_ID,
    name: "Napa 500",
    slug: "napa-500",
    manufacturer: "Beximco",
    price: 12.5,
    stock: 4,
    inStock: true,
    stockStatus: "LOW_STOCK",
    imageUrl: null,
    category: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Pain relief",
      slug: "pain-relief",
    },
    seller: {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Care Pharmacy",
      image: null,
    },
    rating: 4.5,
    reviewCount: 2,
    ...overrides,
  };
};

export const createCatalogMock = () => {
  return {
    search: vi.fn<MedicineCatalog["search"]>().mockResolvedValue([]),
    findDetails: vi.fn<MedicineCatalog["findDetails"]>().mockResolvedValue(null),
    checkAvailability: vi
      .fn<MedicineCatalog["checkAvailability"]>()
      .mockResolvedValue({ products: [], missingIds: [] }),
    compare: vi
      .fn<MedicineCatalog["compare"]>()
      .mockResolvedValue({ products: [], missingIds: [] }),
    hydrate: vi.fn<MedicineCatalog["hydrate"]>().mockResolvedValue([]),
  };
};

export const createScriptedProvider = (turns: AiTurn[]) => {
  let nextTurn = 0;

  const getNextTurn = (): AiTurn => {
    const turn = turns[nextTurn];
    nextTurn += 1;

    if (!turn) {
      throw new Error("Scripted AI provider ran out of turns.");
    }

    return turn;
  };

  const session: AiChatSession = {
    sendUserMessage: vi.fn(async () => getNextTurn()),
    sendToolResults: vi.fn(async (_results: AiToolResponse[]) => getNextTurn()),
  };
  const createChat = vi.fn((_options: unknown) => session);

  return {
    provider: {
      model: "test-gemini-model",
      createChat,
    } satisfies AiProvider,
    session,
    createChat,
  };
};

export const createFailingProvider = (error: Error): AiProvider => {
  const session: AiChatSession = {
    sendUserMessage: vi.fn(async () => {
      throw error;
    }),
    sendToolResults: vi.fn(async (_results: AiToolResponse[]) => {
      throw error;
    }),
  };

  return {
    model: "test-gemini-model",
    createChat: vi.fn(() => session),
  };
};

export const userMessage = (content: string): AiHistoryMessage => ({
  role: "user",
  content,
});
