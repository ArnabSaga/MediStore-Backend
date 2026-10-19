# AI Shopping Assistant - Phase 2

Phase 0 added a backend-only, non-streaming shopping assistant to the public
MediStore catalog. It uses Google Gemini with validated, read-only catalog
tools. It cannot mutate carts, orders, payments, inventory, or accounts.

Phase 0.5 added deterministic, server-rendered product answers, a search-only
fast path, a text safety filter, and sanitized latency metrics. See
[phase-0.5-reliability.md](./phase-0.5-reliability.md) for the benchmark and
grounding results.

Phase 2 adds user-confirmed cart proposals. The assistant can propose setting
final quantities, removing items, or clearing the cart, but it never applies a
change. The server re-fetches the cart from the public catalog, validates the
proposed final cart, and returns a proposal that the client applies only after
the customer presses Confirm.

## Endpoint

```http
POST /api/v1/ai/shopping/chat
Content-Type: application/json
```

The endpoint is public and IP rate-limited to **20 requests per minute**. When
`AI_ENABLED=false` (the default), the route returns `404`.

### Request

```json
{
  "message": "Add two more Napa 500",
  "history": [
    { "role": "user", "content": "I need something for a headache." },
    { "role": "assistant", "content": "I can look up medicines in the catalog." }
  ],
  "cart": {
    "items": [
      { "medicineId": "11111111-1111-4111-8111-111111111111", "quantity": 1 }
    ]
  }
}
```

Validation rules:

- `message`: required, trimmed, 1-1,000 characters.
- `history`: optional, maximum 6 messages.
- Each history message: `role` is `user` or `assistant`; `content` is 1-1,000
  characters.
- `cart`: optional. `items` is an array of at most 20 entries.
- `cart.items[].medicineId`: required UUID.
- `cart.items[].quantity`: required integer from 1 to 10,000.
- Duplicate `medicineId` values inside `cart.items` are rejected.
- Item objects are strict. Client-supplied `price`, `stock`, `sellerId`,
  `name`, or any other field is rejected: only ids and quantities are trusted.
- Unknown request fields are rejected.
- When `cart` is omitted, the request behaves exactly like Phase 1 and the
  response has no `cart` field.
- When `cart` is present, even with an empty `items` array, the search fast
  path is skipped so the model can call `finalizeResponse` with a cart action.
  API clients that do not send a cart keep the fast path unchanged.

### Response

```json
{
  "success": true,
  "message": "AI shopping response generated successfully",
  "data": {
    "answer": "I found Napa 500 by Beximco in the MediStore catalog. The current price is BDT 12.50 and it is low stock with 4 units remaining. It is sold by Care Pharmacy. See the verified product card below for details.",
    "products": [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "name": "Napa 500",
        "slug": "napa-500",
        "manufacturer": "Beximco",
        "price": 12.5,
        "stock": 4,
        "inStock": true,
        "stockStatus": "LOW_STOCK",
        "imageUrl": null,
        "category": {
          "id": "44444444-4444-4444-8444-444444444444",
          "name": "Pain relief",
          "slug": "pain-relief"
        },
        "seller": {
          "id": "55555555-5555-4555-8555-555555555555",
          "name": "Care Pharmacy",
          "image": null
        },
        "rating": 4.5,
        "reviewCount": 2
      }
    ],
    "meta": {
      "model": "gemini-3.1-flash-lite",
      "toolCalls": 1,
      "fallback": false
    }
  }
}
```

`stockStatus` is `IN_STOCK` above 5 units, `LOW_STOCK` at 1-5 units, and
`OUT_OF_STOCK` at 0.

`meta.toolCalls` counts executed catalog tool calls for the request. A search
served by the fast path reports `1`.

### Cart response

Cart requests keep the `answer`, `products`, and `meta` fields and add exactly
one of `cart.proposal`, `cart.conflict`, or `cart.summary`:

```json
{
  "success": true,
  "message": "AI shopping response generated successfully",
  "data": {
    "answer": "I can make this cart change:\n\n- set Napa 500 - quantity 3\n\nPress Confirm to apply it. Nothing changes until you confirm.",
    "products": [],
    "cart": {
      "proposal": {
        "id": "9a7c2a6e-0e1f-4f6a-9b4a-2f7c1d0e5b11",
        "action": "SET_QTY",
        "items": [
          {
            "medicineId": "11111111-1111-4111-8111-111111111111",
            "name": "Napa 500",
            "slug": "napa-500",
            "manufacturer": "Beximco",
            "price": 12.5,
            "stock": 20,
            "imageUrl": null,
            "seller": {
              "id": "55555555-5555-4555-8555-555555555555",
              "name": "Care Pharmacy",
              "image": null
            },
            "previousQuantity": 1,
            "quantity": 3
          }
        ],
        "cartFingerprint": "11111111-1111-4111-8111-111111111111:1"
      }
    },
    "meta": {
      "model": "gemini-3.1-flash-lite",
      "toolCalls": 2,
      "fallback": false
    }
  }
}
```

- `cart.proposal`: a confirmable change. `items` contains only the lines that
  actually change, with `previousQuantity` and the final `quantity`. A final
  quantity of `0` means the item will be removed. `action` is `SET_QTY` or
  `CLEAR`.
- `cart.conflict`: a deterministic rejection. `code` is one of
  `CART_UNAVAILABLE`, `CART_LIMIT`, `PRODUCT_UNAVAILABLE`,
  `INSUFFICIENT_STOCK`, `SINGLE_SELLER`, or `NO_CHANGE`. The `answer` repeats
  the conflict `message` and no card or proposal is returned.
- `cart.summary`: a read-only description of the current cart, including
  `items`, `totalItems`, and `singleSeller`.
- Cart results always use `meta.fallback=false` and an empty `products` array.
  Proposals and summaries are rendered by the server, not by model prose.
- `cartFingerprint` is the sorted `medicineId:quantity` snapshot the proposal
  was built from, or `"empty"` for an empty cart. The client compares it with
  its current cart before applying; a mismatch means the proposal is stale and
  must be discarded.

## Server-rendered product facts

The model never writes product facts that reach the client:

- When the first tool turn contains only successful `searchMedicines` calls,
  the server hydrates the returned ids from the public catalog and renders the
  answer directly. It does not spend a second Gemini generation on a summary.
- The fast path is skipped whenever the request includes `cart`, even an empty
  cart. With a cart attached, the model needs the follow-up turn to call
  `finalizeResponse` with an action, because it only learns product ids from
  tool results.
- When other tools are used, the final `finalizeResponse` ids are hydrated the
  same way. Products are returned only from those hydrated records, and the
  answer is re-rendered from the catalog values.
- Prices are always rendered in BDT from the numeric database price. Stock,
  availability, seller, category, and rating come from the same hydrated
  records. Model prose cannot override them.
- Text-only replies are the only place model prose is returned, and only when
  it passes a safety filter. Otherwise the server returns the neutral safe
  response with `meta.fallback=true`.
- A valid search with no matches returns the no-match message with
  `meta.fallback=false`. A finalization that cites ids the tools never returned
  is treated as a grounding failure and returns the no-match message with
  `meta.fallback=true`.

## Cart proposals

The backend never writes cart data. It validates a proposed change and returns
a proposal; the client applies it only after the customer explicitly confirms.

### Server flow

1. The client sends `cart.items` with medicine ids and quantities.
2. Before the model runs, the server re-fetches every id with
   `findCartItems()` using the public catalog predicate. Price, stock, seller,
   availability, and naming come from the database, never from the client.
3. The verified snapshot is added to the system prompt. The model may only use
   ids from that snapshot or ids returned by a tool in the same conversation.
4. When the model calls `finalizeResponse` with `cartAction`, the pure planner
   (`ai.cart.ts`) computes the exact change set.
5. The server re-fetches the final cart ids and verifies stock, cart size, and
   the single-seller rule against fresh records. Fresh records are
   authoritative: a product that disappeared from the public catalog is
   rejected even if the request snapshot still contained it.
6. On success the server returns a proposal with a fingerprint. Otherwise it
   returns a deterministic conflict, or a retryable tool error for malformed
   actions.

An unknown or non-public id in the request cart rejects the whole request with
`400`: partial carts are never trusted. A cart read failure returns `503`.

### Actions

- `SET_QTY` sets the final desired quantity for each listed medicine. `0`
  removes that medicine. The action is absolute, not incremental, so retries
  and repeated confirmations are idempotent.
- `CLEAR` empties the cart and must be sent with an empty `items` array.
- `cartSummary: true` asks the server to describe the cart. It cannot be
  combined with `cartAction`.

### Stock rules

Stock is enforced only for items that are new or whose quantity increases:

- Fresh `stock <= 0` for a new or increased item returns `PRODUCT_UNAVAILABLE`.
- `quantity > stock` returns `INSUFFICIENT_STOCK`.
- Decreasing or leaving a quantity unchanged is never blocked by a pre-existing
  stock problem, so the customer can always fix their cart.

### Single-seller rule

Checkout accepts only one seller per order. The assistant must never create a
mixed cart:

- If the current cart uses one seller, adding an item from another seller is
  rejected with `SINGLE_SELLER`.
- If the cart is already mixed, removals and quantity changes are allowed, but
  adding another seller is rejected. This lets the customer repair an existing
  mixed cart without the assistant making it worse.
- The message mirrors the checkout limitation: one order can contain medicines
  from only one seller.

### Retry-only errors

Malformed or ungrounded actions never reach the customer. The model receives a
tool error and must correct the action:

| Code | Cause |
| --- | --- |
| `INVALID_ACTION` | `SET_QTY` with no items, `CLEAR` with items, duplicate ids, or `cartAction` combined with `cartSummary`. |
| `INVALID_ITEM` | An id that is neither in the verified cart snapshot nor returned by a tool in this conversation. |
| `INVALID_ARGUMENTS` | `finalizeResponse` fails schema validation. |

### Final conflicts

Returned as `200` with `cart.conflict`:

| Code | Cause |
| --- | --- |
| `CART_UNAVAILABLE` | The model proposed an action without a cart snapshot. |
| `CART_LIMIT` | The final cart would exceed 20 medicines. |
| `PRODUCT_UNAVAILABLE` | A medicine in the final cart is no longer publicly sellable or is out of stock. |
| `INSUFFICIENT_STOCK` | A new or increased quantity exceeds fresh stock. |
| `SINGLE_SELLER` | The change would create a mixed-seller cart or add a seller to an already mixed cart. |
| `NO_CHANGE` | The action would not alter the cart. |

The server never applies a proposal, never removes an existing item silently,
never writes an order, and never touches payment or inventory.

## Environment

```env
AI_ENABLED=false
AI_PROVIDER=gemini
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.1-flash-lite"
AI_TIMEOUT_MS=15000
AI_MAX_TOOL_ROUNDS=3
AI_MAX_TOOL_CALLS=6
```

`GEMINI_API_KEY` and `GEMINI_MODEL` are required only when `AI_ENABLED=true`.
Invalid positive-integer values for timeout or loop limits fail application
startup. `AI_MAX_CART_ITEMS` (20) is a code constant shared by request
validation, the planner, the cart tool schema, and the system prompt.

## Tools

The model can call only these read-only tools:

| Tool | Purpose |
| --- | --- |
| `searchMedicines` | Search public medicines by name, manufacturer, slug, or category. Free-text queries also match category names and slugs. Returns up to 8 cards. |
| `getMedicineDetails` | Read public details and up to 4 images for an id returned earlier. |
| `checkAvailability` | Read current price and stock for up to 8 ids returned earlier. |
| `compareMedicines` | Compare 2–4 ids returned earlier. |
| `finalizeResponse` | Terminal tool containing the customer answer, candidate product ids, and an optional cart action or cart summary request. |

Every argument is validated server-side with Zod. A rejected argument returns a
safe tool error so the model can correct itself. Unknown tools are rejected.

`finalizeResponse` is the preferred way to finish with product cards. The server:

1. Drops any product id that a tool did not return during the same request.
2. Re-queries every remaining id against the public catalog.
3. Returns only hydrated database records, never model-authored product data.

If the model returns text without `finalizeResponse`, the server hydrates only
products previously returned by tools. If it fails to produce a usable answer,
times out, hits the provider quota, or exceeds a loop limit, the endpoint
returns the safe fallback message with `meta.fallback=true` and no products.

For comparisons, the model is instructed to call `searchMedicines` once per
named medicine in the same turn. All successfully returned ids are hydrated
together, and the server renders a factual multi-product answer from those
records.

`finalizeResponse` also accepts cart fields:

- `cartAction: { action: "SET_QTY", items: [{ medicineId, quantity }] }` to
  propose final quantities (`0` removes an item).
- `cartAction: { action: "CLEAR", items: [] }` to propose emptying the cart.
- `cartSummary: true` to ask the server to describe the current cart.

The model's `answer` is never used for cart output. The server builds proposal,
summary, and conflict text from verified records. See
[Cart proposals](#cart-proposals).

## Latency and reliability metrics

Every production request logs one sanitized JSON line:

```text
[ai] shopping-chat metrics {"event":"ai.shopping.chat","model":"...","totalMs":2661,"providerCalls":1,"providerMs":[1797],"databaseQueries":2,"databaseMs":[452,147],"toolRounds":0,"toolCalls":1,"finalizationMs":147,"timeoutStage":null,"errorCategory":null,"fallback":false}
```

The payload contains only:

- total request duration, each provider call, each catalog query, and the
  finalization step;
- tool round and tool call counts;
- the timeout stage, if a timeout happened;
- a sanitized upstream error category (`TIMEOUT`, `QUOTA`, `INVALID_RESPONSE`,
  `CLIENT`, `CATALOG`, or `INTERNAL`);
- the fallback flag.

`CLIENT` marks a rejected cart snapshot, such as a medicine that is no longer
in the public catalog. `CATALOG` marks a database failure while reading or
verifying the cart.

It never logs API keys, prompts, customer messages or PII, raw tool payloads,
or private inventory data. Metrics logging is skipped under `NODE_ENV=test`,
and a metrics logger failure never changes the response.

## Catalog safety

All tool queries use the shared `buildPublicMedicineWhere()` predicate:

- Medicine is active and not deleted.
- Category is active and not deleted.
- Seller is a verified, active, non-banned, non-deleted `SELLER`.

Cart verification uses the same predicate through `findCartItems()`, which
selects only id, name, slug, manufacturer, price, stock, image URL, and the
seller's public id, name, and image.

Safe Prisma selects intentionally omit seller email/phone, customer data,
review author details, and any other PII. They also limit images to four and
select only review ratings for aggregate rating/count. Product cards are the
only product payload sent back to clients.

The system prompt forbids inventing products, prices, stock, prescription
status, expiry dates, or discounts. It also forbids diagnosis, prescribing,
dosage advice, and treatment instructions. The catalog has no prescription or
batch/expiry fields in Phase 0, so the assistant must not claim either exists.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid request body, history, or cart snapshot. A cart medicine that is no longer publicly sellable also returns `400`. |
| `404` | `AI_ENABLED` is false, or another route was not found. |
| `429` | More than 20 requests from the same IP in one minute. |
| `503` | Gemini quota or provider unavailability, or the cart could not be read. |
| `504` | Gemini request timed out. |

Errors use the existing API error envelope:

```json
{
  "success": false,
  "statusCode": 503,
  "message": "The AI assistant is temporarily unavailable because the provider limit was reached. Please try again later.",
  "errorSources": [
    {
      "path": "",
      "message": "The AI assistant is temporarily unavailable because the provider limit was reached. Please try again later."
    }
  ]
}
```

## Tests

```bash
pnpm test
pnpm lint
```

Tests use a mocked Gemini SDK or a scripted fake AI provider, plus a Prisma-free
catalog double. They do not call Gemini or connect to a database. Coverage
includes public-field selection, hidden/inactive exclusion, category-aware
free-text search, invalid tool arguments, hallucinated product ids, provider
timeout/quota errors with timeout-stage metrics, loop limits, the feature flag,
request validation, rate limiting, PII-free selects, preservation of Gemini
thought signatures and function-call ids, the search-only fast path, BDT
rendering, rejection of wrong-currency/strength/equivalence prose, safe fallback
on hydration failure, and metrics payload sanitization.

Phase 2 coverage adds cart request validation, strict rejection of client
price/stock/seller fields, duplicate-id rejection, request-cart verification,
absolute quantity planning, removal and clear proposals, stock enforcement for
new and increased lines only, single-seller enforcement including already mixed
carts, retry-only malformed and ungrounded actions, stale-proposal
fingerprints, cart summaries, no-change and cart-limit conflicts, cart read
failures, final-verification fallback, and proof that no cart state is mutated
without confirmation.

## Limitations

- This repository serves the API only. The customer chat UI lives in the
  frontend repository.
- No cart mutation, order, or payment actions. Cart changes are proposals that
  the client applies only after explicit confirmation.
- The backend does not persist carts; the cart snapshot is client-owned.
- No seller/admin assistant.
- No prescription, batch, or expiry data.
- No streaming responses.
- `AI_ENABLED` stays `false` until a release decision. Production model choice
  is still open: `gemini-3.1-flash-lite` remains the configured model, and
  `gemini-3.5-flash-lite` passed the Phase 0.5 gate only as a temporary
  benchmark candidate.
- Rate limiting uses the default in-memory store, so it is per-process. A
  multi-instance deployment needs a shared store (for example Redis) for strict
  global enforcement.
- `trust proxy` is enabled at the app level, so production must not expose the
  origin directly. The hosting proxy must overwrite client-supplied
  `X-Forwarded-For` headers.
