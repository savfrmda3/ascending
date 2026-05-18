import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  MINI_APP_URL: z.string().url().optional().or(z.literal("")),
  BACKEND_URL: z.string().url().optional().or(z.literal("")),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(24, "JWT_SECRET should be at least 24 characters"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000)
});

export const env = envSchema.parse(process.env);
