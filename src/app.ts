import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";

import { envVars } from "./app/config/env";
import { auth } from "./app/lib/auth";
import notFound from "./app/middleware/NotFound";
import globalErrorHandler from "./app/middleware/globalErrorHandler";
import router from "./app/routes";

const app: Application = express();

app.set("trust proxy", true);
app.use(cookieParser());

app.use(
  cors({
    origin: [envVars.FRONTEND_URL, "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Content-Type", "Set-Cookie"],
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
