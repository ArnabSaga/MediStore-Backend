import { Request, Response } from "express";
import status from "http-status";

import AppError from "../../error/AppError";
import catchAsync from "../../utils/catchAsync";
import { queryHelper } from "../../utils/queryHelper";
import { sendResponse } from "../../utils/sendResponse";
import { ReviewService } from "./review.service";

const getRequiredParam = (value: unknown, fieldName: string) => {
  const parsed = queryHelper.getSingleValue(value);

  if (parsed === undefined || parsed === null || parsed === "") {
    throw new AppError(status.BAD_REQUEST, `${fieldName} is required`);
  }

  return String(parsed);
};

const createReview = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.createReview({
    customerId: req.user!.id,
    medicineId: req.body.medicineId,
    rating: req.body.rating,
    comment: req.body.comment,
  });

  sendResponse(res, {
    success: true,
    statusCode: status.CREATED,
    message: "Review created successfully",
    data: result,
  });
});

const getMedicineReviews = catchAsync(async (req: Request, res: Response) => {
  const medicineId = getRequiredParam(req.params.medicineId, "Medicine id");

  const result = await ReviewService.getMedicineReviews(
    medicineId,
    req.query as Record<string, unknown>
  );

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Reviews fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getMyReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.getUserReviews(
    req.user!.id,
    req.query as Record<string, unknown>
  );

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "My reviews fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const updateReview = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Review id");

  const result = await ReviewService.updateReview(id, req.user!.id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Review updated successfully",
    data: result,
  });
});

const deleteReview = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Review id");

  await ReviewService.deleteReview(id, req.user!.id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Review deleted successfully",
    data: null,
  });
});

export const ReviewController = {
  createReview,
  getMedicineReviews,
  getMyReviews,
  updateReview,
  deleteReview,
};
