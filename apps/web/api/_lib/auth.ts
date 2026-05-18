import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { requiredEnv } from "./env.js";
import { getBearerToken, type ApiRequest, unauthorized } from "./http.js";

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  username?: string;
}

export function validateTelegramInitData(initData: string): TelegramInitUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = params.get("auth_date");
  const userRaw = params.get("user");

  if (!hash || !authDate || !userRaw || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw unauthorized("Telegram initData is incomplete or invalid");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - Number(authDate);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 60 * 24) {
    throw unauthorized("Telegram initData has expired");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(requiredEnv("BOT_TOKEN")).digest();
  const calculatedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(hash, "hex"))) {
    throw unauthorized("Telegram initData signature is invalid");
  }

  const user = JSON.parse(userRaw) as TelegramInitUser;
  if (!user.id) throw unauthorized("Telegram user payload is invalid");
  return user;
}

export function signSession(userId: string, telegramId: number) {
  return jwt.sign({ telegramId }, requiredEnv("JWT_SECRET"), {
    subject: userId,
    expiresIn: "30d"
  });
}

export function requireSession(req: ApiRequest) {
  const token = getBearerToken(req);
  if (!token) throw unauthorized("Missing bearer token");

  try {
    const payload = jwt.verify(token, requiredEnv("JWT_SECRET")) as jwt.JwtPayload & { telegramId: number };
    if (!payload.sub || !payload.telegramId) throw unauthorized("Invalid token payload");
    return {
      userId: payload.sub,
      telegramId: payload.telegramId
    };
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}

