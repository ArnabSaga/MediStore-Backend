import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { Application, Request, Response } from "express";

import { auth } from "./app/lib/auth";

import notFound from "./app/middleware/NotFound";
import globalErrorHandler from "./app/middleware/globalErrorHandler";
import router from "./app/routes";
import { envVars } from "./app/config/env";

const app: Application = express();

app.use(express.json());

app.use(
  cors({
    origin: envVars.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-workspace-id", "Cookie"],
    exposedHeaders: ["Content-Type", "Set-Cookie"],
  })
);

//* Auth routes (better-auth)
app.all("/api/auth/*splat", toNodeHandler(auth));

//* API Routes
app.use("/api/v1", router);

//* Home route
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World To Medi Store");
});

//! 404 handler
app.use(notFound);

//! Global error handler
app.use(globalErrorHandler);

export default app;
