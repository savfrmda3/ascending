import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { unauthorized } from "../lib/errors.js";

interface JwtPayload {
  sub: string;
  telegramId: number;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) return next(unauthorized("Missing bearer token"));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.auth = {
      userId: payload.sub,
      telegramId: payload.telegramId
    };
    return next();
  } catch {
    return next(unauthorized("Invalid or expired token"));
  }
}

export function requireBotToken(req: Request, _res: Response, next: NextFunction) {
  const token = req.header("x-bot-token");
  if (!token || token !== env.BOT_TOKEN) {
    return next(unauthorized("Invalid bot token"));
  }

  return next();
}
