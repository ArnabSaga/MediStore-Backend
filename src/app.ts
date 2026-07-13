import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";

import { envVars } from "./app/config/env";
import { auth } from "./app/lib/auth";
import notFound from "./app/middleware/NotFound";
import globalErrorHandler from "./app/middleware/globalErrorHandler";
import router from "./app/routes";

import { isOriginAllowed } from "./app/config/origins";

const app: Application = express();

app.set("trust proxy", true);
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without Origin may come from trusted server-to-server clients,
      // health checks, or same-origin proxy traffic. Authorization is still
      // enforced by route middleware.
      if (!origin) {
        return callback(null, true);
      }

      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Rejected origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use("/api/auth", (req, res) => {
  return toNodeHandler(auth)(req, res);
});

app.use(express.json());

app.use("/api/v1", router);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World To Medi Store");
});

app.use(notFound);
app.use(globalErrorHandler);

export default app;

