export type AiHistoryRole = "user" | "assistant";

export interface AiHistoryMessage {
  role: AiHistoryRole;
  content: string;
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface AiFunctionCall {
  id?: string;
  name: string;
  args: unknown;
}

export interface AiToolResponse {
  name: string;
  id?: string;
  response: Record<string, unknown>;
}

export interface AiTurn {
  text?: string;
  functionCalls: AiFunctionCall[];
}

export interface AiChatSession {
  sendUserMessage(message: string): Promise<AiTurn>;
  sendToolResults(results: AiToolResponse[]): Promise<AiTurn>;
}

export interface AiChatOptions {
  systemInstruction: string;
  tools: AiToolDeclaration[];
  history: AiHistoryMessage[];
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly model: string;
  createChat(options: AiChatOptions): AiChatSession;
}

export type AiStockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface AiMedicineCategory {
  id: string;
  name: string;
  slug: string;
}

export interface AiMedicineSeller {
  id: string;
  name: string;
  image: string | null;
}

export interface AiMedicineCard {
  id: string;
  name: string;
  slug: string;
  manufacturer: string;
  price: number;
  stock: number;
  inStock: boolean;
  stockStatus: AiStockStatus;
  imageUrl: string | null;
  category: AiMedicineCategory;
  seller: AiMedicineSeller;
  rating: number;
  reviewCount: number;
}

export interface AiMedicineImage {
  id: string;
  url: string;
  sortOrder: number;
}

export interface AiMedicineDetails extends AiMedicineCard {
  description: string | null;
  images: AiMedicineImage[];
}

export interface AiMedicineAvailability {
  id: string;
  name: string;
  price: number;
  stock: number;
  inStock: boolean;
  stockStatus: AiStockStatus;
}

export interface AiCatalogSearchInput {
  query: string;
  limit?: number;
  category?: string;
}

export interface AiCatalogAvailabilityResult {
  products: AiMedicineAvailability[];
  missingIds: string[];
}

export interface AiCatalogCompareResult {
  products: AiMedicineCard[];
  missingIds: string[];
}

export interface MedicineCatalog {
  search(input: AiCatalogSearchInput): Promise<AiMedicineCard[]>;
  findDetails(medicineId: string): Promise<AiMedicineDetails | null>;
  checkAvailability(medicineIds: string[]): Promise<AiCatalogAvailabilityResult>;
  compare(medicineIds: string[]): Promise<AiCatalogCompareResult>;
  hydrate(medicineIds: string[]): Promise<AiMedicineCard[]>;
}

export interface AiToolExecutionResult {
  response: Record<string, unknown>;
  productIds: string[];
}

export interface AiShoppingChatInput {
  message: string;
  history?: AiHistoryMessage[];
}

export interface AiShoppingChatResult {
  answer: string;
  products: AiMedicineCard[];
  meta: {
    model: string;
    toolCalls: number;
    fallback: boolean;
  };
}
