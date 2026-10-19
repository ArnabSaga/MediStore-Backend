import { RequestHandler } from "express";
import status from "http-status";

import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ShoppingChatService } from "./ai.service";
import type { TShoppingChatRequest } from "./ai.validation";

export const createAiShoppingChatController = (
  service: ShoppingChatService
): RequestHandler => {
  return catchAsync(async (req, res) => {
    const body = req.body as TShoppingChatRequest;
    const result = await service.chat({
      message: body.message,
      history: body.history,
      cart: body.cart,
    });

    sendResponse(res, {
      success: true,
      statusCode: status.OK,
      message: "AI shopping response generated successfully",
      data: result,
    });
  });
};
