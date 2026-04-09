import { ErrorRequestHandler } from "express";
import status from "http-status";
import multer from "multer";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { envVars } from "../config/env";
import { MAX_FILE_SIZE } from "../constants/upload";
import AppError from "../error/AppError";
import {
  handlePrismaClientInitializationError,
  handlePrismaClientKnownRequestError,
  handlePrismaClientRustPanicError,
  handlePrismaClientUnknownError,
  handlePrismaClientValidationError,
} from "../error/handlePrismaErrors";
import { TErrorSources } from "../interfaces/error.interface";
import { destroyCloudinaryAssetByUrl } from "../lib/cloudinary";

const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (envVars.NODE_ENV === "development") {
    const method = req.method;
    const url = req.originalUrl || req.url;

    if (err instanceof AppError && err.statusCode === status.UNAUTHORIZED) {
      if (!url.includes("/api/v1/auth/me")) {
        console.warn(`[${method} ${url}] 🔓 ${err.message}`);
      }
    } else if (err instanceof ZodError) {
      console.error(`[${method} ${url}] [Zod Validation Error]:`, err.issues);
    } else if (err instanceof SyntaxError && "body" in err) {
      console.error(`[${method} ${url}] [Syntax Error in Request Body]:`, err.message);
    } else {
      console.error(`[${method} ${url}] Unexpected Error:`, err);
    }
  }

  const cleanupUploadedFiles = async () => {
    try {
      const filesToDelete: string[] = [];
      const anyReq = req as any;

      if (anyReq.file && anyReq.file.path) {
        filesToDelete.push(anyReq.file.path);
      }

      if (anyReq.files) {
        if (Array.isArray(anyReq.files)) {
          anyReq.files.forEach((file: any) => {
            if (file.path) filesToDelete.push(file.path);
          });
        } else {
          Object.values(anyReq.files).forEach((fileArray: any) => {
            if (Array.isArray(fileArray)) {
              fileArray.forEach((file: any) => {
                if (file.path) filesToDelete.push(file.path);
              });
            }
          });
        }
      }

      if (filesToDelete.length > 0) {
        await Promise.allSettled(filesToDelete.map((path) => destroyCloudinaryAssetByUrl(path)));
      }
    } catch (cleanupError) {
      console.error(
        "[Cleanup Warning]: Failed to remove Cloudinary assets during error handling.",
        cleanupError
      );
    }
  };
  cleanupUploadedFiles();

  let statusCode: number = status.INTERNAL_SERVER_ERROR;
  let message = "Something went wrong!";
  let errorSources: TErrorSources[] = [
    {
      path: "",
      message: "Something went wrong!",
    },
  ];

  if (err instanceof ZodError) {
    statusCode = status.BAD_REQUEST;
    message = "Validation Error";
    errorSources = err.issues.map((issue) => ({
      path: issue.path.length ? issue.path.join(".") : "",
      message: issue.message,
    }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const simplifiedError = handlePrismaClientKnownRequestError(err);
    statusCode = simplifiedError.statusCode ?? status.BAD_REQUEST;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    const simplifiedError = handlePrismaClientValidationError(err);
    statusCode = simplifiedError.statusCode ?? status.BAD_REQUEST;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const simplifiedError = handlePrismaClientUnknownError(err);
    statusCode = simplifiedError.statusCode ?? status.INTERNAL_SERVER_ERROR;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    const simplifiedError = handlePrismaClientInitializationError(err);
    statusCode = simplifiedError.statusCode ?? status.INTERNAL_SERVER_ERROR;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof Prisma.PrismaClientRustPanicError) {
    const simplifiedError = handlePrismaClientRustPanicError();
    statusCode = simplifiedError.statusCode ?? status.INTERNAL_SERVER_ERROR;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err instanceof multer.MulterError) {
    statusCode = status.BAD_REQUEST;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File size must not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        : err.message;
    errorSources = [{ path: "", message }];
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [{ path: "", message: err.message }];
  } else if (err instanceof Error) {
    message = err.message;
    errorSources = [{ path: "", message: err.message }];
  }

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errorSources,
    error: envVars.NODE_ENV === "development" ? err : undefined,
    stack: envVars.NODE_ENV === "development" ? err?.stack : undefined,
  });
};

export default globalErrorHandler;
