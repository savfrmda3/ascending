import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFound, tooManyRequests } from "./lib/errors.js";
import { router } from "./routes/http.js";

export function createApp() {
  const app = express();

  app.use(securityHeaders);
  app.use(
    cors({
      origin: env.NODE_ENV === "production" && env.MINI_APP_URL ? env.MINI_APP_URL : true,
      credentials: true
    })
  );
  app.use(rateLimit(120, 60_000));
  app.use(express.json({ limit: "64kb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(router);
  app.use((_req, _res, next) => next(notFound("Route not found")));
  app.use(errorHandler);

  return app;
}

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  next();
}

function rateLimit(limit: number, windowMs: number) {
  const store = new Map<string, { count: number; resetAt: number }>();

  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    next(current.count > limit ? tooManyRequests("Rate limit exceeded") : undefined);
  };
}
