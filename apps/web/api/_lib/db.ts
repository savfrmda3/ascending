import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "./env.js";

export const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

