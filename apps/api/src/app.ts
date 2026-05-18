import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { router } from "./routes/http.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.NODE_ENV === "production" && env.MINI_APP_URL ? env.MINI_APP_URL : true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(router);
  app.use((_req, _res, next) => next(notFound("Route not found")));
  app.use(errorHandler);

  return app;
}
