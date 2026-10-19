# Phase 0.5 Reliability Report (Sanitized)

This report summarizes the Phase 0.5 reliability benchmark for the AI shopping
assistant endpoint. It contains aggregate timings, counts, and outcomes only. It
does not contain API keys, prompts, customer messages, database connection
strings, raw tool payloads, or private seller/customer data.

## What changed

- A search-only agent turn is finalized from a fresh public-catalog hydration
  instead of a second Gemini generation.
- Product-bearing answers are always rendered on the server from hydrated
  catalog records; model-authored product prose is never returned.
- Text-only model replies are returned only when they pass a safety filter that
  rejects prices, currency symbols, stock claims, strengths, equivalence claims,
  and clinical advice.
- Free-text catalog searches now also match category names and slugs, so
  symptom-area requests such as "allergy" resolve to catalog products.
- Requests, provider calls, catalog queries, tool rounds, finalization, timeout
  stage, and sanitized error category are logged as one JSON metrics line per
  request.

## Benchmark method

- Endpoint: `POST /api/v1/ai/shopping/chat` with the production validation,
  rate limiter, and catalog tool path.
- Model candidate: `gemini-3.5-flash-lite` (temporary benchmark override; the
  configured model in `.env` was not changed).
- Four scenarios per cycle: medicine search, follow-up, comparison, and a
  nonexistent medicine. Five cycles = 20 requests per config.
- Each successful response was validated against the public catalog for price,
  stock, stock status, product-name, and BDT rendering, and scanned for
  unsupported currency, strength, equivalence, and clinical-advice claims.
- Benchmark ran on port `5001` with `AI_ENABLED=true` as a temporary process
  environment override. The repository `.env` remained `AI_ENABLED=false`.

## Results

| Config | Timeout | Fast path | Requests | Passed | Timeouts | Provider calls/request | Response p50 | Response p95 | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 15s | on | 20 | 20/20 | 0 | 1 | 2.66s | 4.64s | 4.80s |
| B | 25s | on | 20 | 20/20 | 0 | 1 | 2.07s | 3.98s | 4.13s |
| Baseline (fast path off) | 15s | off | 8 | 1/8 | 7 | 2–3 | 15.01s | 15.02s | 15.03s |
| Pre-Phase 0.5 (historical) | 15s | off | 12 | 7/12 | 5 | 2+ | — | — | 15.1s |

Config B produced no timeouts or retries at 15 seconds, so the larger 25-second
timeout added no reliability and only increased the worst-case wait. The fast
path is the decisive change: with it disabled, 7 of 8 sampled requests hit the
15-second timeout, and the remaining request still spent two provider calls.

### Stage latency (config A, 20 requests)

| Stage | p50 | p95 |
| --- | --- | --- |
| Provider call | 1.80s | 3.88s |
| Catalog queries (per request total) | 0.60s | 1.51s |
| Finalization (hydrate + render) | 0.14s | 0.80s |
| End-to-end response | 2.66s | 4.64s |

Config B stage latency was similar: provider p50 1.41s / p95 2.92s, catalog
p50 0.63s / p95 1.87s, finalization p50 0.14s / p95 0.76s.

### Grounding checks (configs A and B, 40 validated responses)

| Check | Violations |
| --- | --- |
| Non-BDT currency or currency symbol | 0 |
| Unsupported medicine strength | 0 |
| Fabricated equivalence claim | 0 |
| Clinical or prescribing advice | 0 |
| Price mismatch vs public catalog | 0 |
| Stock mismatch vs public catalog | 0 |
| Stock status mismatch vs public catalog | 0 |
| Unknown/hallucinated product id | 0 |
| Missing BDT price in answer | 0 |
| Missing product name in answer | 0 |

Scenario outcomes were consistent across both configs:

- Medicine search: 1 verified product card every cycle.
- Follow-up ("cheaper allergy option"): 2 verified allergy products every
  cycle.
- Comparison ("Napa One and Fexo"): both named products every cycle.
- Nonexistent medicine: 0 products with the no-match message and
  `meta.fallback=false` every cycle.

Zero responses used the `fallback` or safe-response path during the two gate
runs. No provider quota or capacity errors occurred.

## Recommended production configuration

- `AI_TIMEOUT_MS=15000` — sufficient with the fast path; 25s adds no value.
- Keep the search fast path enabled.
- `AI_MAX_TOOL_ROUNDS=3` and `AI_MAX_TOOL_CALLS=6` remain unchanged.
- Do not permanently switch models yet. `gemini-3.5-flash-lite` passed this
  gate only as a temporary benchmark candidate; the repository remains
  configured with `gemini-3.1-flash-lite`. Confirm the production model choice
  separately before enabling AI.
- `AI_ENABLED` remains `false` by default.

## Residual risks

- Rate limiting is still the in-memory per-process limiter (20 requests per
  minute); multi-instance deployments need shared storage.
- The fast path covers search-only turns. Multi-step tool turns still make a
  second provider call; their answers are still server-grounded.
- Results are catalog-dependent: the benchmarked catalog contained 6 public
  products. Re-run the gate after material catalog or prompt changes.
- The benchmark ran from a single machine against a single backend instance;
  provider latency from production regions may differ.
