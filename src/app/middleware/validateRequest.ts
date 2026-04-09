import { NextFunction, Request, Response } from "express";
import { ZodError, ZodObject } from "zod";
import status from "http-status";

type TValidationSchema = {
  body?: ZodObject<any, any>;
  query?: ZodObject<any, any>;
  params?: ZodObject<any, any>;
};

const validateRequest = (schema: TValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      if (schema.query) {
        const parsedQuery = schema.query.parse(req.query);
        Object.defineProperty(req, "query", {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      if (schema.params) {
        const parsedParams = schema.params.parse(req.params);
        Object.defineProperty(req, "params", {
          value: parsedParams,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(status.BAD_REQUEST).json({
          success: false,
          statusCode: status.BAD_REQUEST,
          message: "Validation error",
          errorSources: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      next(error);
    }
  };
};

export default validateRequest;
