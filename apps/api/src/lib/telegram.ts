import crypto from "node:crypto";
import { badRequest, unauthorized } from "./errors.js";

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function validateTelegramInitData(initData: string, botToken: string): TelegramInitUser {
  if (!initData) {
    throw badRequest("Telegram initData is required");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = params.get("auth_date");
  const userRaw = params.get("user");

  if (!hash || !authDate || !userRaw) {
    throw unauthorized("Telegram initData is incomplete");
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw unauthorized("Telegram initData signature is invalid");
  }

  const authTimestamp = Number(authDate);
  if (!Number.isFinite(authTimestamp)) {
    throw unauthorized("Telegram auth_date is invalid");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authTimestamp;
  if (ageSeconds > 60 * 60 * 24) {
    throw unauthorized("Telegram initData has expired");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(hash, "hex"));
  if (!isValid) {
    throw unauthorized("Telegram initData signature is invalid");
  }

  try {
    const user = JSON.parse(userRaw) as TelegramInitUser;
    if (!user.id) {
      throw unauthorized("Telegram user payload is invalid");
    }

    return user;
  } catch {
    throw unauthorized("Telegram user payload is invalid");
  }
}
