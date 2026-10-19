import { Router } from "express";
import rateLimit from "express-rate-limit";
import status from "http-status";

import { envVars } from "../../config/env";
import validateRequest from "../../middleware/validateRequest";
import { AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS } from "./ai.constants";
import { createAiShoppingChatController } from "./ai.controller";
import { AiShoppingService, type ShoppingChatService } from "./ai.service";
import { shoppingChatRequestSchema } from "./ai.validation";

export interface AiShoppingRouterOptions {
  service?: ShoppingChatService;
  enabled?: boolean;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
}

export const createAiShoppingRouter = (
  options: AiShoppingRouterOptions = {}
): Router => {
  const router = Router();
  const enabled = options.enabled ?? envVars.AI_ENABLED;
  const service = options.service ?? AiShoppingService;

  router.use((_req, res, next) => {
    if (!enabled) {
      res.status(status.NOT_FOUND).json({
        success: false,
        statusCode: status.NOT_FOUND,
        message: "The AI shopping assistant is not enabled.",
        errorSources: [
          {
            path: "",
            message: "The AI shopping assistant is not enabled.",
          },
        ],
      });
      return;
    }

    next();
  });

  const limiter = rateLimit({
    windowMs: options.rateLimitWindowMs ?? AI_RATE_LIMIT_WINDOW_MS,
    limit: options.rateLimitMax ?? AI_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // The app sets `trust proxy` for its hosting proxy. The default rate-limit
    // proxy check is intentionally disabled; deployment must not expose the
    // origin directly or clients could spoof X-Forwarded-For.
    validate: {
      trustProxy: false,
    },
    handler: (_req, res) => {
      res.status(status.TOO_MANY_REQUESTS).json({
        success: false,
        statusCode: status.TOO_MANY_REQUESTS,
        message: "Too many AI requests. Please wait a minute and try again.",
        errorSources: [
          {
            path: "",
            message: "Too many AI requests. Please wait a minute and try again.",
          },
        ],
      });
    },
  });

  router.post(
    "/chat",
    limiter,
    validateRequest({ body: shoppingChatRequestSchema }),
    createAiShoppingChatController(service)
  );

  return router;
};

export const AiShoppingRouter = createAiShoppingRouter();
