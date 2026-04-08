import { NextFunction, Request, Response } from "express";
import { MedicineService } from "./medicine.service";
import { generateSlug } from "../../helpers/generateSlug";
import paginationSortingHelper from "../../helpers/paginationSortingHelper";

const createMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const {
      name,
      price,
      stock,
      manufacturer,
      categoryId,
      slug,
      description,
      imageUrl,
      isActive,
    } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      throw Object.assign(new Error("name is required (min 2 chars)"), {
        statusCode: 400,
      });
    }

    if (typeof price !== "number" || Number.isNaN(price) || price <= 0) {
      throw Object.assign(new Error("price must be a positive number"), {
        statusCode: 400,
      });
    }

    if (!Number.isInteger(stock) || stock < 0) {
      throw Object.assign(new Error("stock must be a non-negative integer"), {
        statusCode: 400,
      });
    }

    if (
      !manufacturer ||
      typeof manufacturer !== "string" ||
      manufacturer.trim().length < 2
    ) {
      throw Object.assign(new Error("manufacturer is required (min 2 chars)"), {
        statusCode: 400,
      });
    }

    if (!categoryId || typeof categoryId !== "string") {
      throw Object.assign(new Error("categoryId is required"), {
        statusCode: 400,
      });
    }

    const finalSlug =
      typeof slug === "string" && slug.trim().length > 0
        ? generateSlug(slug)
        : generateSlug(name);

    const payload: any = {
      name: name.trim(),
      slug: finalSlug,
      price,
      stock,
      manufacturer: manufacturer.trim(),
      categoryId,
      sellerId,
    };

    if (typeof description === "string" && description.trim().length > 0) {
      payload.description = description.trim();
    }

    if (typeof imageUrl === "string" && imageUrl.trim().length > 0) {
      payload.imageUrl = imageUrl.trim();
    }

    if (typeof isActive === "boolean") {
      payload.isActive = isActive;
    }

    const result = await MedicineService.createMedicine(payload);

    res.status(201).json({
      success: true,
      message: "Medicine created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAllMedicines = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { categoryId, search, minPrice, maxPrice, manufacturer } = req.query;

    const filters: any = {};

    if (typeof categoryId === "string") filters.categoryId = categoryId;
    if (typeof search === "string") filters.search = search;
    if (typeof manufacturer === "string") filters.manufacturer = manufacturer;

    if (typeof minPrice === "string") filters.minPrice = Number(minPrice);
    if (typeof maxPrice === "string") filters.maxPrice = Number(maxPrice);

    const pagination = paginationSortingHelper(req.query);

    const result = await MedicineService.getAllMedicines(filters, pagination);

    res.status(200).json({
      success: true,
      message: "Medicines fetched successfully",
      meta: {
        page: pagination.page,
        limit: pagination.limit,
      },
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getMedicineById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const result = await MedicineService.getMedicineById(id);

    res.status(200).json({
      success: true,
      message: "Medicine fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getSellerMedicines = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const includeInactive =
      typeof req.query.includeInactive === "string"
        ? req.query.includeInactive === "true"
        : false;

    const result = await MedicineService.getSellerMedicines(
      sellerId,
      includeInactive
    );

    res.status(200).json({
      success: true,
      message: "Seller medicines fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const actor = req.user;
    if (!actor)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const payload = req.body ?? {};
    const result = await MedicineService.updateMedicineForSeller(
      id,
      payload,
      actor.id
    );

    res.status(200).json({
      success: true,
      message: "Medicine updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const actor = req.user;
    if (!actor)
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    await MedicineService.deleteMedicineForSeller(id, actor.id);

    res.status(200).json({
      success: true,
      message: "Medicine deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

//* Admin endpoints
const adminUpdateMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const payload = req.body ?? {};
    const result = await MedicineService.updateMedicineAsAdmin(id, payload);

    res.status(200).json({
      success: true,
      message: "Medicine updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const adminDeleteMedicine = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    await MedicineService.deleteMedicineAsAdmin(id);

    res.status(200).json({
      success: true,
      message: "Medicine deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const MedicineController = {
  createMedicine,
  getAllMedicines,
  getMedicineById,
  getSellerMedicines,
  updateMedicine,
  deleteMedicine,
  adminUpdateMedicine,
  adminDeleteMedicine,
};
