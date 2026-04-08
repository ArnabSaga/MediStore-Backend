import { NextFunction, Request, Response } from "express";
import { ReviewService } from "./review.service";
import paginationSortingHelper from "../../helpers/paginationSortingHelper";

const createReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const { medicineId, rating, comment } = req.body;

    if (!medicineId || rating === undefined || !comment) {
      throw Object.assign(
        new Error("Missing required fields: medicineId, rating, comment"),
        { statusCode: 400 }
      );
    }

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      throw Object.assign(
        new Error("Rating must be a number between 1 and 5"),
        {
          statusCode: 400,
        }
      );
    }

    if (typeof comment !== "string" || comment.trim().length < 3) {
      throw Object.assign(new Error("Comment must be at least 3 characters"), {
        statusCode: 400,
      });
    }

    const result = await ReviewService.createReview({
      customerId,
      medicineId,
      rating,
      comment: comment.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getMedicineReviews = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const medicineId = String(req.params.medicineId);

    const pagination = paginationSortingHelper(req.query);

    const result = await ReviewService.getMedicineReviews(
      medicineId,
      pagination
    );

    res.status(200).json({
      success: true,
      message: "Reviews fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getUserReviews = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const pagination = paginationSortingHelper(req.query);

    const result = await ReviewService.getUserReviews(customerId, pagination);

    res.status(200).json({
      success: true,
      message: "Your reviews fetched successfully",
      meta: { page: pagination.page, limit: pagination.limit },
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const customerId = req.user?.id;

    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    const { rating, comment } = req.body;

    // Optional validation (if provided)
    if (
      rating !== undefined &&
      (typeof rating !== "number" || rating < 1 || rating > 5)
    ) {
      throw Object.assign(
        new Error("Rating must be a number between 1 and 5"),
        {
          statusCode: 400,
        }
      );
    }

    if (
      comment !== undefined &&
      (typeof comment !== "string" || comment.trim().length < 3)
    ) {
      throw Object.assign(new Error("Comment must be at least 3 characters"), {
        statusCode: 400,
      });
    }

    const result = await ReviewService.updateReview(id, customerId, {
      rating,
      comment: typeof comment === "string" ? comment.trim() : undefined,
    });

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const customerId = req.user?.id;

    if (!customerId) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }

    await ReviewService.deleteReview(id, customerId);

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const ReviewController = {
  createReview,
  getMedicineReviews,
  getUserReviews,
  updateReview,
  deleteReview,
};
