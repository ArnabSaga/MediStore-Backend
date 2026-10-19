import { describe, expect, it } from "vitest";

import {
  buildCartConflict,
  buildCartContext,
  buildCartFingerprint,
  buildCartProposal,
  buildCartProposalAnswer,
  buildCartSummary,
  buildCartSummaryAnswer,
  planCartAction,
  verifyFinalCart,
  type AiCartPlanChange,
} from "../src/app/modules/ai/ai.cart";
import { buildAiSystemPrompt } from "../src/app/modules/ai/ai.prompt";
import type { AiCartContext, AiCartProduct } from "../src/app/modules/ai/ai.types";
import {
  HALLUCINATED_ID,
  MEDICINE_ID,
  MEDICINE_ID_2,
  OTHER_SELLER_ID,
  createCartProduct,
} from "./ai.test-helpers";

const THIRD_SELLER_ID = "99999999-9999-4999-8999-999999999999";
const THIRD_MEDICINE_ID = "88888888-8888-4888-8888-888888888888";

const otherSeller = { id: OTHER_SELLER_ID, name: "Health Mart", image: null };
const thirdSeller = { id: THIRD_SELLER_ID, name: "City Pharma", image: null };

const allowedIds = (...ids: string[]) => new Set(ids);

const buildContext = (
  items: { medicineId: string; quantity: number }[],
  products: AiCartProduct[] = [createCartProduct()]
): AiCartContext => {
  const context = buildCartContext(items, products);

  if (!context) {
    throw new Error("Test cart context is missing products.");
  }

  return context;
};

const planOrThrow = (
  ...args: Parameters<typeof planCartAction>
): Extract<ReturnType<typeof planCartAction>, { kind: "apply" }> => {
  const plan = planCartAction(...args);

  if (plan.kind !== "apply") {
    throw new Error(`Expected an apply plan, received ${plan.kind}.`);
  }

  return plan;
};

const verify = (
  cart: AiCartContext,
  changes: AiCartPlanChange[],
  finalQuantities: ReadonlyMap<string, number>,
  freshProducts: AiCartProduct[]
) => verifyFinalCart({ cart, changes, finalQuantities, freshProducts });

describe("AI cart helpers", () => {
  it("builds an order-insensitive cart fingerprint", () => {
    expect(buildCartFingerprint([])).toBe("empty");
    expect(buildCartFingerprint([{ medicineId: MEDICINE_ID, quantity: 1 }])).toBe(
      `${MEDICINE_ID}:1`
    );
    expect(
      buildCartFingerprint([
        { medicineId: MEDICINE_ID_2, quantity: 2 },
        { medicineId: MEDICINE_ID, quantity: 1 },
      ])
    ).toBe(
      buildCartFingerprint([
        { medicineId: MEDICINE_ID, quantity: 1 },
        { medicineId: MEDICINE_ID_2, quantity: 2 },
      ])
    );
    expect(
      buildCartFingerprint([{ medicineId: MEDICINE_ID, quantity: 3 }])
    ).not.toBe(buildCartFingerprint([{ medicineId: MEDICINE_ID, quantity: 4 }]));
  });

  it("joins the client snapshot to freshly fetched products only", () => {
    const napa = createCartProduct();

    const context = buildCartContext([{ medicineId: MEDICINE_ID, quantity: 2 }], [
      { ...napa, price: 99.99, stock: 0 },
    ]);

    expect(context).not.toBeNull();
    expect(context?.items).toEqual([
      { ...napa, price: 99.99, stock: 0, quantity: 2 },
    ]);
    expect(context?.singleSeller).toBe(true);
    expect(context?.sellerIds).toEqual([napa.seller.id]);
  });

  it("rejects a snapshot with a medicine that is no longer public", () => {
    expect(
      buildCartContext([{ medicineId: MEDICINE_ID, quantity: 1 }], [])
    ).toBeNull();
    expect(
      buildCartContext(
        [
          { medicineId: MEDICINE_ID, quantity: 1 },
          { medicineId: MEDICINE_ID_2, quantity: 1 },
        ],
        [createCartProduct()]
      )
    ).toBeNull();
  });

  it("flags carts that mix sellers", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      seller: otherSeller,
    });

    const context = buildContext(
      [
        { medicineId: MEDICINE_ID, quantity: 1 },
        { medicineId: MEDICINE_ID_2, quantity: 1 },
      ],
      [napa, ace]
    );

    expect(context.singleSeller).toBe(false);
    expect(context.sellerIds).toEqual([napa.seller.id, ace.seller.id]);
  });

  it("returns retryable errors for malformed or ungrounded actions", () => {
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 1 }]);

    expect(
      planCartAction(
        { action: "SET_QTY", items: [] },
        cart,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "retry", conflict: { code: "INVALID_ACTION" } });

    expect(
      planCartAction(
        { action: "CLEAR", items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
        cart,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "retry", conflict: { code: "INVALID_ACTION" } });

    expect(
      planCartAction(
        {
          action: "SET_QTY",
          items: [
            { medicineId: MEDICINE_ID, quantity: 1 },
            { medicineId: MEDICINE_ID, quantity: 2 },
          ],
        },
        cart,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "retry", conflict: { code: "INVALID_ACTION" } });

    expect(
      planCartAction(
        { action: "SET_QTY", items: [{ medicineId: HALLUCINATED_ID, quantity: 1 }] },
        cart,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "retry", conflict: { code: "INVALID_ITEM" } });
  });

  it("rejects cart actions when no cart snapshot was provided", () => {
    expect(
      planCartAction(
        { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 1 }] },
        null,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "rejected", conflict: { code: "CART_UNAVAILABLE" } });
  });

  it("sets final quantities for new and existing cart lines", () => {
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 1 }]);

    const increase = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 3 }] },
      cart,
      allowedIds(MEDICINE_ID)
    );

    expect(increase.action).toBe("SET_QTY");
    expect(increase.changes).toEqual([
      { medicineId: MEDICINE_ID, previousQuantity: 1, quantity: 3 },
    ]);

    const add = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID_2, quantity: 2 }] },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2)
    );

    expect(add.changes).toEqual([
      { medicineId: MEDICINE_ID_2, previousQuantity: 0, quantity: 2 },
    ]);
    expect(add.finalQuantities.get(MEDICINE_ID)).toBe(1);
    expect(add.finalQuantities.get(MEDICINE_ID_2)).toBe(2);

    const remove = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 0 }] },
      cart,
      allowedIds(MEDICINE_ID)
    );

    expect(remove.changes).toEqual([
      { medicineId: MEDICINE_ID, previousQuantity: 1, quantity: 0 },
    ]);
    expect(remove.finalQuantities.has(MEDICINE_ID)).toBe(false);
  });

  it("plans a clear from every current cart line", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({ id: MEDICINE_ID_2, name: "Ace 500" });
    const cart = buildContext(
      [
        { medicineId: MEDICINE_ID, quantity: 2 },
        { medicineId: MEDICINE_ID_2, quantity: 1 },
      ],
      [napa, ace]
    );

    const plan = planOrThrow(
      { action: "CLEAR", items: [] },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2)
    );

    expect(plan.action).toBe("CLEAR");
    expect(plan.changes).toEqual([
      { medicineId: MEDICINE_ID, previousQuantity: 2, quantity: 0 },
      { medicineId: MEDICINE_ID_2, previousQuantity: 1, quantity: 0 },
    ]);
    expect(plan.finalQuantities.size).toBe(0);
  });

  it("rejects no-op actions without changing anything", () => {
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 2 }]);
    const emptyCart = buildContext([]);

    expect(
      planCartAction(
        { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 2 }] },
        cart,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "rejected", conflict: { code: "NO_CHANGE" } });

    expect(
      planCartAction(
        { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 0 }] },
        emptyCart,
        allowedIds(MEDICINE_ID)
      )
    ).toMatchObject({ kind: "rejected", conflict: { code: "NO_CHANGE" } });

    expect(
      planCartAction({ action: "CLEAR", items: [] }, emptyCart, allowedIds())
    ).toMatchObject({ kind: "rejected", conflict: { code: "NO_CHANGE" } });
  });

  it("rejects a change that would exceed the cart limit", () => {
    const products = Array.from({ length: 21 }, (_, index) =>
      createCartProduct({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        name: `Medicine ${index}`,
      })
    );
    const cart = buildContext(
      products.slice(0, 20).map((product) => ({
        medicineId: product.id,
        quantity: 1,
      })),
      products
    );

    const plan = planCartAction(
      {
        action: "SET_QTY",
        items: [{ medicineId: products[20].id, quantity: 1 }],
      },
      cart,
      allowedIds(...products.map((product) => product.id))
    );

    expect(plan).toMatchObject({
      kind: "rejected",
      conflict: { code: "CART_LIMIT" },
    });
  });

  it("blocks only new or increased quantities over stock", () => {
    const napa = createCartProduct({ stock: 2 });
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 1 }], [napa]);
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 5 }] },
      cart,
      allowedIds(MEDICINE_ID)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa]
    );

    expect(verification.conflict).toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("never blocks a decrease because of a pre-existing stock problem", () => {
    const napa = createCartProduct({ stock: 1 });
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 4 }], [napa]);
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 2 }] },
      cart,
      allowedIds(MEDICINE_ID)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa]
    );

    expect(verification.conflict).toBeNull();
  });

  it("rejects a new item that is out of stock", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      stock: 0,
    });
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 1 }], [napa]);
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID_2, quantity: 1 }] },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa, ace]
    );

    expect(verification.conflict).toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });

  it("trusts the fresh cart query over the request snapshot", () => {
    const napa = createCartProduct({ stock: 20 });
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 1 }], [napa]);
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 2 }] },
      cart,
      allowedIds(MEDICINE_ID)
    );

    // The medicine disappeared from the public catalog between the request
    // snapshot and the final verification. The stale snapshot must not make an
    // unavailable product look purchasable.
    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      []
    );

    expect(verification.conflict).toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });

  it("rejects mixing sellers into a single-seller cart", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      seller: otherSeller,
    });
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 1 }], [napa]);
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID_2, quantity: 1 }] },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa, ace]
    );

    expect(verification.conflict).toMatchObject({ code: "SINGLE_SELLER" });
  });

  it("allows fixing an already-mixed cart by removing items", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      seller: otherSeller,
    });
    const cart = buildContext(
      [
        { medicineId: MEDICINE_ID, quantity: 1 },
        { medicineId: MEDICINE_ID_2, quantity: 1 },
      ],
      [napa, ace]
    );
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 0 }] },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa, ace]
    );

    expect(verification.conflict).toBeNull();
  });

  it("never adds a new seller to an already-mixed cart", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({
      id: MEDICINE_ID_2,
      name: "Ace 500",
      seller: otherSeller,
    });
    const third = createCartProduct({
      id: THIRD_MEDICINE_ID,
      name: "Rolaids",
      seller: thirdSeller,
    });
    const cart = buildContext(
      [
        { medicineId: MEDICINE_ID, quantity: 1 },
        { medicineId: MEDICINE_ID_2, quantity: 1 },
      ],
      [napa, ace]
    );
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: THIRD_MEDICINE_ID, quantity: 1 }] },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2, THIRD_MEDICINE_ID)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa, ace, third]
    );

    expect(verification.conflict).toMatchObject({ code: "SINGLE_SELLER" });
  });

  it("keeps a verified snapshot of removed items for the proposal card", () => {
    const napa = createCartProduct();
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 2 }], [napa]);
    const plan = planOrThrow(
      { action: "SET_QTY", items: [{ medicineId: MEDICINE_ID, quantity: 0 }] },
      cart,
      allowedIds(MEDICINE_ID)
    );

    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa]
    );
    const proposal = buildCartProposal(
      plan.action,
      plan.changes,
      cart.fingerprint,
      verification.snapshots
    );

    expect(proposal).not.toBeNull();
    expect(proposal?.id).toHaveLength(36);
    expect(proposal?.cartFingerprint).toBe(cart.fingerprint);
    expect(proposal?.items).toEqual([
      {
        medicineId: MEDICINE_ID,
        name: "Napa 500",
        slug: "napa-500",
        manufacturer: "Beximco",
        price: 12.5,
        stock: 20,
        imageUrl: null,
        seller: napa.seller,
        previousQuantity: 2,
        quantity: 0,
      },
    ]);
  });

  it("writes confirmation-first proposal copy with plain hyphens", () => {
    const napa = createCartProduct();
    const ace = createCartProduct({ id: MEDICINE_ID_2, name: "Ace 500" });
    const cart = buildContext(
      [{ medicineId: MEDICINE_ID, quantity: 1 }],
      [napa, ace]
    );
    const plan = planOrThrow(
      {
        action: "SET_QTY",
        items: [
          { medicineId: MEDICINE_ID, quantity: 0 },
          { medicineId: MEDICINE_ID_2, quantity: 2 },
        ],
      },
      cart,
      allowedIds(MEDICINE_ID, MEDICINE_ID_2)
    );
    const verification = verify(
      cart,
      plan.changes,
      plan.finalQuantities,
      [napa, ace]
    );
    const proposal = buildCartProposal(
      plan.action,
      plan.changes,
      cart.fingerprint,
      verification.snapshots
    );

    const answer = buildCartProposalAnswer(proposal!);

    expect(answer).toContain("add Ace 500 - quantity 2");
    expect(answer).toContain("remove Napa 500");
    expect(answer).toContain("Confirm");
    expect(answer).toContain("Nothing changes until you confirm");
    expect(answer).not.toContain("—");

    const clearAnswer = buildCartProposalAnswer(
      buildCartProposal("CLEAR", plan.changes, cart.fingerprint, verification.snapshots)!
    );

    expect(clearAnswer).toContain("empty your MediStore cart");
    expect(clearAnswer).toContain("Confirm");
  });

  it("builds a read-only cart summary", () => {
    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 2 }]);
    const summary = buildCartSummary(cart);

    expect(summary).toMatchObject({ totalItems: 2, singleSeller: true });
    expect(summary.items).toEqual([
      {
        medicineId: MEDICINE_ID,
        name: "Napa 500",
        slug: "napa-500",
        quantity: 2,
        stock: 20,
        inStock: true,
        seller: cart.items[0].seller,
      },
    ]);

    const answer = buildCartSummaryAnswer(summary);

    expect(answer).toContain("Napa 500");
    expect(answer).toContain("Nothing in your cart was changed");
  });

  it("describes an empty cart without changes", () => {
    const summary = buildCartSummary({
      items: [],
      sellerIds: [],
      singleSeller: true,
      fingerprint: "empty",
    });

    expect(buildCartSummaryAnswer(summary)).toContain("cart is empty");
  });

  it("provides deterministic conflict messages without em dashes", () => {
    const codes = [
      "CART_UNAVAILABLE",
      "CART_LIMIT",
      "INVALID_ACTION",
      "INVALID_ITEM",
      "PRODUCT_UNAVAILABLE",
      "INSUFFICIENT_STOCK",
      "SINGLE_SELLER",
      "NO_CHANGE",
    ] as const;

    for (const code of codes) {
      const conflict = buildCartConflict(code);

      expect(conflict.code).toBe(code);
      expect(conflict.message.length).toBeGreaterThan(0);
      expect(conflict.message).not.toContain("—");
    }
  });

  it("adds the verified cart snapshot to the system prompt only when provided", () => {
    expect(buildAiSystemPrompt(null)).not.toContain("Customer cart snapshot");

    const cart = buildContext([{ medicineId: MEDICINE_ID, quantity: 2 }]);
    const prompt = buildAiSystemPrompt(cart);

    expect(prompt).toContain("Customer cart snapshot");
    expect(prompt).toContain(`id ${MEDICINE_ID}`);
    expect(prompt).toContain("quantity 2");
    expect(prompt).toContain("stock 20");
    expect(prompt).toContain("Cart handling rules");
  });
});
