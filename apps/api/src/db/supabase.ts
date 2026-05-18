import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);

export const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function normalizeSupabaseUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  }
}
