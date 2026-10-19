import { randomUUID } from "node:crypto";

import { AI_MAX_CART_ITEMS } from "./ai.constants";
import type {
  AiCartAction,
  AiCartConflict,
  AiCartConflictCode,
  AiCartContext,
  AiCartContextItem,
  AiCartProduct,
  AiCartProposal,
  AiCartProposalItem,
  AiCartSummary,
} from "./ai.types";
import type { TCartActionArgs } from "./ai.validation";

export interface AiCartSnapshotItem {
  medicineId: string;
  quantity: number;
}

export interface AiCartPlanChange {
  medicineId: string;
  previousQuantity: number;
  quantity: number;
}

export type AiCartPlan =
  | { kind: "retry"; conflict: AiCartConflict }
  | { kind: "rejected"; conflict: AiCartConflict }
  | {
      kind: "apply";
      action: AiCartAction;
      changes: AiCartPlanChange[];
      finalQuantities: Map<string, number>;
    };

export interface AiCartVerification {
  conflict: AiCartConflict | null;
  snapshots: Map<string, AiCartProduct>;
}

const CONFLICT_MESSAGES: Record<AiCartConflictCode, string> = {
  CART_UNAVAILABLE:
    "I couldn't read your cart for that request. Please refresh the page and try again.",
  CART_LIMIT: `A MediStore cart can hold up to ${AI_MAX_CART_ITEMS} medicines. Remove something before adding more.`,
  INVALID_ACTION:
    "Use SET_QTY with at least one item (quantity 0 removes an item), or CLEAR with an empty items array. Do not repeat medicine ids.",
  INVALID_ITEM:
    "Only medicines already in the customer's cart or returned by a tool in this conversation can be used. Search for the product first.",
  PRODUCT_UNAVAILABLE:
    "One of those medicines is not available right now. It may be out of stock or removed from the catalog. Remove it from the cart and try again.",
  INSUFFICIENT_STOCK:
    "There isn't enough stock for the quantity you asked for. Reduce the quantity or choose another product.",
  SINGLE_SELLER:
    "For now, one order can contain medicines from only one seller. This change would mix sellers, so nothing was changed. Remove the other seller's items first or choose a product from the same seller.",
  NO_CHANGE: "That change wouldn't make a difference to your cart, so nothing was changed.",
};

export const buildCartConflict = (code: AiCartConflictCode): AiCartConflict => {
  return { code, message: CONFLICT_MESSAGES[code] };
};

const safeText = (value: string, maxLength = 120): string => {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

/**
 * Deterministic fingerprint of the client cart snapshot at send time. The
 * frontend compares it before applying a proposal so a stale proposal cannot
 * overwrite a cart that changed in another tab.
 */
export const buildCartFingerprint = (
  items: readonly AiCartSnapshotItem[]
): string => {
  if (items.length === 0) {
    return "empty";
  }

  // Code-unit order, not localeCompare: the frontend recomputes this exact
  // value, and locale collation can differ between Node and browser ICU.
  return [...items]
    .sort((left, right) => {
      if (left.medicineId === right.medicineId) {
        return 0;
      }

      return left.medicineId < right.medicineId ? -1 : 1;
    })
    .map((item) => `${item.medicineId}:${item.quantity}`)
    .join("|");
};

/**
 * Joins the client snapshot to freshly fetched public products. Returns null
 * when any requested medicine is no longer publicly sellable, so the caller
 * can reject the request instead of trusting a partial cart.
 */
export const buildCartContext = (
  requestItems: readonly AiCartSnapshotItem[],
  products: readonly AiCartProduct[]
): AiCartContext | null => {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const items: AiCartContextItem[] = [];

  for (const requestItem of requestItems) {
    const product = productsById.get(requestItem.medicineId);

    if (!product) {
      return null;
    }

    items.push({ ...product, quantity: requestItem.quantity });
  }

  const sellerIds = Array.from(new Set(items.map((item) => item.seller.id)));

  return {
    items,
    sellerIds,
    singleSeller: sellerIds.length <= 1,
    fingerprint: buildCartFingerprint(requestItems),
  };
};

const hasDuplicateIds = (
  items: readonly { medicineId: string }[]
): boolean => {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.medicineId)) {
      return true;
    }

    seen.add(item.medicineId);
  }

  return false;
};

/**
 * Pure planning step. Turns a model-proposed cart action into either a
 * retryable tool error (malformed or ungrounded action), a final conflict
 * (nothing safe to propose), or the exact quantity changes to validate.
 */
export const planCartAction = (
  action: TCartActionArgs,
  cart: AiCartContext | null,
  allowedMedicineIds: ReadonlySet<string>
): AiCartPlan => {
  if (!cart) {
    return { kind: "rejected", conflict: buildCartConflict("CART_UNAVAILABLE") };
  }

  if (action.action === "SET_QTY" && action.items.length === 0) {
    return { kind: "retry", conflict: buildCartConflict("INVALID_ACTION") };
  }

  if (action.action === "CLEAR" && action.items.length > 0) {
    return { kind: "retry", conflict: buildCartConflict("INVALID_ACTION") };
  }

  if (hasDuplicateIds(action.items)) {
    return { kind: "retry", conflict: buildCartConflict("INVALID_ACTION") };
  }

  if (action.items.some((item) => !allowedMedicineIds.has(item.medicineId))) {
    return { kind: "retry", conflict: buildCartConflict("INVALID_ITEM") };
  }

  const currentQuantities = new Map(
    cart.items.map((item) => [item.id, item.quantity])
  );

  if (action.action === "CLEAR") {
    if (currentQuantities.size === 0) {
      return { kind: "rejected", conflict: buildCartConflict("NO_CHANGE") };
    }

    return {
      kind: "apply",
      action: "CLEAR",
      changes: cart.items.map((item) => ({
        medicineId: item.id,
        previousQuantity: item.quantity,
        quantity: 0,
      })),
      finalQuantities: new Map(),
    };
  }

  const finalQuantities = new Map(currentQuantities);
  const changes: AiCartPlanChange[] = [];

  for (const item of action.items) {
    const previousQuantity = currentQuantities.get(item.medicineId) ?? 0;

    if (item.quantity <= 0) {
      if (previousQuantity > 0) {
        finalQuantities.delete(item.medicineId);
        changes.push({
          medicineId: item.medicineId,
          previousQuantity,
          quantity: 0,
        });
      }

      continue;
    }

    if (item.quantity === previousQuantity) {
      continue;
    }

    finalQuantities.set(item.medicineId, item.quantity);
    changes.push({
      medicineId: item.medicineId,
      previousQuantity,
      quantity: item.quantity,
    });
  }

  if (changes.length === 0) {
    return { kind: "rejected", conflict: buildCartConflict("NO_CHANGE") };
  }

  if (finalQuantities.size > AI_MAX_CART_ITEMS) {
    return { kind: "rejected", conflict: buildCartConflict("CART_LIMIT") };
  }

  return { kind: "apply", action: "SET_QTY", changes, finalQuantities };
};

/**
 * Final safety pass over the cart that would exist after confirmation.
 *
 * Stock is enforced for new or increased quantities only: a decrease or an
 * untouched line must never be blocked by a pre-existing stock problem.
 *
 * Single seller: a proposal may never create a mixed cart, and may never add a
 * new seller to a cart that is already mixed. Removing items is always allowed
 * so the customer can fix an already-mixed cart.
 */
export const verifyFinalCart = (params: {
  cart: AiCartContext;
  changes: readonly AiCartPlanChange[];
  finalQuantities: ReadonlyMap<string, number>;
  freshProducts: readonly AiCartProduct[];
}): AiCartVerification => {
  const { cart, changes, finalQuantities, freshProducts } = params;
  const freshById = new Map(freshProducts.map((product) => [product.id, product]));
  const contextById = new Map(cart.items.map((item) => [item.id, item]));
  const snapshots = new Map<string, AiCartProduct>();
  const finalSellerIds = new Set<string>();

  for (const [medicineId, quantity] of finalQuantities) {
    if (quantity <= 0) {
      continue;
    }

    const snapshot = freshById.get(medicineId);

    // The final cart is re-fetched from the public catalog, so a missing
    // record means the medicine is no longer sellable. Do not fall back to the
    // request-time snapshot for products that remain in the cart.
    if (!snapshot) {
      return { conflict: buildCartConflict("PRODUCT_UNAVAILABLE"), snapshots };
    }

    snapshots.set(medicineId, snapshot);
    finalSellerIds.add(snapshot.seller.id);
  }

  for (const change of changes) {
    if (change.quantity <= 0 || change.quantity <= change.previousQuantity) {
      continue;
    }

    const snapshot = snapshots.get(change.medicineId);

    if (!snapshot || snapshot.stock <= 0) {
      return { conflict: buildCartConflict("PRODUCT_UNAVAILABLE"), snapshots };
    }

    if (change.quantity > snapshot.stock) {
      return { conflict: buildCartConflict("INSUFFICIENT_STOCK"), snapshots };
    }
  }

  if (finalSellerIds.size > 1) {
    const currentSellerIds = new Set(cart.sellerIds);
    const introducesNewSeller = Array.from(finalSellerIds).some(
      (sellerId) => !currentSellerIds.has(sellerId)
    );

    if (currentSellerIds.size <= 1 || introducesNewSeller) {
      return { conflict: buildCartConflict("SINGLE_SELLER"), snapshots };
    }
  }

  // Removed items still need a verified snapshot so the proposal card can
  // display what is being removed.
  for (const change of changes) {
    if (change.quantity <= 0 && !snapshots.has(change.medicineId)) {
      const existing = contextById.get(change.medicineId);

      if (existing) {
        snapshots.set(change.medicineId, existing);
      }
    }
  }

  return { conflict: null, snapshots };
};

export const buildCartProposal = (
  action: AiCartAction,
  changes: readonly AiCartPlanChange[],
  cartFingerprint: string,
  snapshots: ReadonlyMap<string, AiCartProduct>
): AiCartProposal | null => {
  const items: AiCartProposalItem[] = [];

  for (const change of changes) {
    const snapshot = snapshots.get(change.medicineId);

    if (!snapshot) {
      return null;
    }

    items.push({
      medicineId: snapshot.id,
      name: snapshot.name,
      slug: snapshot.slug,
      manufacturer: snapshot.manufacturer,
      price: snapshot.price,
      stock: snapshot.stock,
      imageUrl: snapshot.imageUrl,
      seller: snapshot.seller,
      previousQuantity: change.previousQuantity,
      quantity: change.quantity,
    });
  }

  return {
    id: randomUUID(),
    action,
    items,
    cartFingerprint,
  };
};

const describeProposalItem = (item: AiCartProposalItem): string => {
  const name = safeText(item.name);

  if (item.quantity <= 0) {
    return `remove ${name}`;
  }

  if (item.previousQuantity <= 0) {
    return `add ${name} - quantity ${item.quantity}`;
  }

  return `set ${name} - quantity ${item.quantity}`;
};

export const buildCartProposalAnswer = (proposal: AiCartProposal): string => {
  if (proposal.action === "CLEAR") {
    return "I can empty your MediStore cart. Review the change below and press Confirm to apply it. Nothing changes until you confirm.";
  }

  const lines = proposal.items
    .map((item) => `- ${describeProposalItem(item)}`)
    .join("\n");
  const heading =
    proposal.items.length === 1
      ? "I can make this cart change:"
      : `I can make these ${proposal.items.length} cart changes:`;

  return `${heading}\n\n${lines}\n\nPress Confirm to apply it. Nothing changes until you confirm.`;
};

export const buildCartSummary = (cart: AiCartContext): AiCartSummary => {
  return {
    items: cart.items.map((item) => ({
      medicineId: item.id,
      name: item.name,
      slug: item.slug,
      quantity: item.quantity,
      stock: item.stock,
      inStock: item.stock > 0,
      seller: item.seller,
    })),
    totalItems: cart.items.reduce((total, item) => total + item.quantity, 0),
    singleSeller: cart.singleSeller,
  };
};

export const buildCartSummaryAnswer = (summary: AiCartSummary): string => {
  if (summary.items.length === 0) {
    return "Your MediStore cart is empty right now. Tell me what you need and I can help you find it.";
  }

  const lines = summary.items
    .map(
      (item) =>
        `- ${safeText(item.name)} by ${safeText(item.seller.name)} - quantity ${item.quantity}${
          item.inStock ? "" : " (currently out of stock)"
        }`
    )
    .join("\n");
  const heading =
    summary.items.length === 1
      ? "Your cart has 1 medicine:"
      : `Your cart has ${summary.items.length} medicines:`;

  return `${heading}\n\n${lines}\n\nNothing in your cart was changed. Stock and prices are re-checked at checkout.`;
};
