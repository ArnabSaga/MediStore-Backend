import { Request, Response } from "express";
import status from "http-status";

import AppError from "../../error/AppError";
import catchAsync from "../../utils/catchAsync";
import { queryHelper } from "../../utils/queryHelper";
import { sendResponse } from "../../utils/sendResponse";
import { CategoryService } from "./category.service";

const getRequiredParam = (value: unknown, fieldName: string) => {
  const parsed = queryHelper.getSingleValue(value);

  if (parsed === undefined || parsed === null || parsed === "") {
    throw new AppError(status.BAD_REQUEST, `${fieldName} is required`);
  }

  return String(parsed);
};

const createCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.createCategory(req.body);

  sendResponse(res, {
    success: true,
    statusCode: status.CREATED,
    message: "Category created successfully",
    data: result,
  });
});

const getAllCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await CategoryService.getAllCategories(req.query as Record<string, unknown>);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Categories fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getCategoryBySlug = catchAsync(async (req: Request, res: Response) => {
  const slug = getRequiredParam(req.params.slug, "Category slug");
  const result = await CategoryService.getCategoryBySlug(slug);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Category fetched successfully",
    data: result,
  });
});

const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Category id");
  const result = await CategoryService.getCategoryById(id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Category fetched successfully",
    data: result,
  });
});

const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Category id");
  const result = await CategoryService.updateCategory(id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Category updated successfully",
    data: result,
  });
});

const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const id = getRequiredParam(req.params.id, "Category id");
  await CategoryService.deleteCategory(id);

  sendResponse(res, {
    success: true,
    statusCode: status.OK,
    message: "Category deleted successfully",
    data: null,
  });
});

export const CategoryController = {
  createCategory,
  getAllCategories,
  getCategoryBySlug,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
