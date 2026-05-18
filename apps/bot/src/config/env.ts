import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  MINI_APP_URL: z.string().url(),
  BACKEND_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
