# AI Shopping Assistant — Phase 0.5

Phase 0 added a backend-only, non-streaming shopping assistant to the public
MediStore catalog. It uses Google Gemini with validated, read-only catalog
tools. It cannot mutate carts, orders, payments, inventory, or accounts.

Phase 0.5 adds deterministic, server-rendered product answers, a search-only
fast path, a text safety filter, and sanitized latency metrics. See
[phase-0.5-reliability.md](./phase-0.5-reliability.md) for the benchmark and
grounding results.

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
  "message": "Do you have Napa 500?",
  "history": [
    { "role": "user", "content": "I need something for a headache." },
    { "role": "assistant", "content": "I can look up medicines in the catalog." }
  ]
}
```

Validation rules:

- `message`: required, trimmed, 1–1,000 characters.
- `history`: optional, maximum 6 messages.
- Each history message: `role` is `user` or `assistant`; `content` is 1–1,000
  characters.
- Unknown request fields are rejected.

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

`stockStatus` is `IN_STOCK` above 5 units, `LOW_STOCK` at 1–5 units, and
`OUT_OF_STOCK` at 0.

`meta.toolCalls` counts executed catalog tool calls for the request. A search
served by the fast path reports `1`.

## Server-rendered product facts

The model never writes product facts that reach the client:

- When the first tool turn contains only successful `searchMedicines` calls,
  the server hydrates the returned ids from the public catalog and renders the
  answer directly. It does not spend a second Gemini generation on a summary.
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
startup.

## Tools

The model can call only these read-only tools:

| Tool | Purpose |
| --- | --- |
| `searchMedicines` | Search public medicines by name, manufacturer, slug, or category. Free-text queries also match category names and slugs. Returns up to 8 cards. |
| `getMedicineDetails` | Read public details and up to 4 images for an id returned earlier. |
| `checkAvailability` | Read current price and stock for up to 8 ids returned earlier. |
| `compareMedicines` | Compare 2–4 ids returned earlier. |
| `finalizeResponse` | Terminal tool containing the customer answer and candidate product ids. |

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
  `CATALOG`, or `INTERNAL`);
- the fallback flag.

It never logs API keys, prompts, customer messages or PII, raw tool payloads,
or private inventory data. Metrics logging is skipped under `NODE_ENV=test`,
and a metrics logger failure never changes the response.

## Catalog safety

All tool queries use the shared `buildPublicMedicineWhere()` predicate:

- Medicine is active and not deleted.
- Category is active and not deleted.
- Seller is a verified, active, non-banned, non-deleted `SELLER`.

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
| `400` | Invalid request body or history. |
| `404` | `AI_ENABLED` is false, or another route was not found. |
| `429` | More than 20 requests from the same IP in one minute. |
| `503` | Gemini quota or provider unavailability. |
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

## Limitations

- No customer chat UI.
- No cart, order, or payment actions.
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
