import { NextFunction, Request, Response } from "express";
import { CategoryService } from "./category.service";
import { generateSlug } from "../../helpers/generateSlug";
import paginationSortingHelper from "../../helpers/paginationSortingHelper";

const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, slug, description } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      throw Object.assign(new Error("name is required (min 2 chars)"), {
        statusCode: 400,
      });
    }

    const finalSlug =
      typeof slug === "string" && slug.trim().length > 0
        ? generateSlug(slug) // normalize any custom slug
        : generateSlug(name);

    const categoryData: { name: string; slug: string; description?: string } = {
      name: name.trim(),
      slug: finalSlug,
    };

    if (typeof description === "string" && description.trim().length > 0) {
      categoryData.description = description.trim();
    }

    const result = await CategoryService.createCategory(categoryData);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAllCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const pagination = paginationSortingHelper(req.query);

    const result = await CategoryService.getAllCategories(pagination);

    res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      meta: result.meta,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

const getCategoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const result = await CategoryService.getCategoryById(id);

    res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getCategoryBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const slug = String(req.params.slug);
    const result = await CategoryService.getCategoryBySlug(slug);

    res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const payload = req.body ?? {};

    if (payload.name !== undefined) {
      if (typeof payload.name !== "string" || payload.name.trim().length < 2) {
        throw Object.assign(new Error("name must be a string (min 2 chars)"), {
          statusCode: 400,
        });
      }
      payload.name = payload.name.trim();
    }

    if (payload.slug !== undefined) {
      if (typeof payload.slug !== "string" || payload.slug.trim().length < 2) {
        throw Object.assign(new Error("slug must be a string (min 2 chars)"), {
          statusCode: 400,
        });
      }
      payload.slug = generateSlug(payload.slug);
    }

    if (payload.description !== undefined) {
      if (
        payload.description !== null &&
        typeof payload.description !== "string"
      ) {
        throw Object.assign(new Error("description must be a string or null"), {
          statusCode: 400,
        });
      }
      payload.description =
        typeof payload.description === "string"
          ? payload.description.trim()
          : null;
    }

    const result = await CategoryService.updateCategory(id, payload);

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    await CategoryService.deleteCategory(id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const CategoryController = {
  createCategory,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
  deleteCategory,
};
