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

export interface AiCartRequestItem {
  medicineId: string;
  quantity: number;
}

export interface AiCartInput {
  items: AiCartRequestItem[];
}

export interface AiCartProduct {
  id: string;
  name: string;
  slug: string;
  manufacturer: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  seller: AiMedicineSeller;
}

export interface AiCartContextItem extends AiCartProduct {
  quantity: number;
}

export interface AiCartContext {
  items: AiCartContextItem[];
  sellerIds: string[];
  singleSeller: boolean;
  fingerprint: string;
}

export type AiCartAction = "SET_QTY" | "CLEAR";

export interface AiCartProposalItem {
  medicineId: string;
  name: string;
  slug: string;
  manufacturer: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  seller: AiMedicineSeller;
  previousQuantity: number;
  quantity: number;
}

export interface AiCartProposal {
  id: string;
  action: AiCartAction;
  items: AiCartProposalItem[];
  cartFingerprint: string;
}

export type AiCartConflictCode =
  | "CART_UNAVAILABLE"
  | "CART_LIMIT"
  | "INVALID_ACTION"
  | "INVALID_ITEM"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "SINGLE_SELLER"
  | "NO_CHANGE";

export interface AiCartConflict {
  code: AiCartConflictCode;
  message: string;
}

export interface AiCartSummaryItem {
  medicineId: string;
  name: string;
  slug: string;
  quantity: number;
  stock: number;
  inStock: boolean;
  seller: AiMedicineSeller;
}

export interface AiCartSummary {
  items: AiCartSummaryItem[];
  totalItems: number;
  singleSeller: boolean;
}

export interface AiCartResult {
  proposal?: AiCartProposal;
  conflict?: AiCartConflict;
  summary?: AiCartSummary;
}

export interface MedicineCatalog {
  search(input: AiCatalogSearchInput): Promise<AiMedicineCard[]>;
  findDetails(medicineId: string): Promise<AiMedicineDetails | null>;
  checkAvailability(medicineIds: string[]): Promise<AiCatalogAvailabilityResult>;
  compare(medicineIds: string[]): Promise<AiCatalogCompareResult>;
  hydrate(medicineIds: string[]): Promise<AiMedicineCard[]>;
  findCartItems(medicineIds: string[]): Promise<AiCartProduct[]>;
}

export interface AiToolExecutionResult {
  response: Record<string, unknown>;
  productIds: string[];
}

export interface AiShoppingChatInput {
  message: string;
  history?: AiHistoryMessage[];
  cart?: AiCartInput;
}

export interface AiShoppingChatResult {
  answer: string;
  products: AiMedicineCard[];
  cart?: AiCartResult;
  meta: {
    model: string;
    toolCalls: number;
    fallback: boolean;
  };
}
