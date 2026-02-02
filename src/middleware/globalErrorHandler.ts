import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";

function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  let statusCode: number =
    typeof err?.statusCode === "number" ? err.statusCode : 500;
  let message: string =
    typeof err?.message === "string" && err.message.trim().length > 0
      ? err.message
      : "Internal Server Error";

  //* PRISMA
  if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid data provided.";
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "Duplicate value violates unique constraint.";
        break;

      case "P2025":
        statusCode = 404;
        message = "Requested resource not found.";
        break;

      case "P2003":
        statusCode = 409;
        message = "Foreign key constraint violation.";
        break;

      case "P2007":
        statusCode = 400;
        message = "Invalid input data.";
        break;

      default:
        statusCode = 400;
        message = "Database request error.";
    }
  } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = 500;
    message = "Unexpected database error.";
  }

  //* AUTH / CUSTOM
  else if (err?.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Unauthorized access.";
  } else if (err?.name === "ForbiddenError") {
    statusCode = 403;
    message = "Forbidden access.";
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err?.stack,
      prismaCode: err?.code,
    }),
  });
}

export default globalErrorHandler;
