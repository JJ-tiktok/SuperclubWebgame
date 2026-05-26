import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfigIssue } from "./config";

export function hasSupabaseBrowserEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !getPublicSupabaseConfigIssue());
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey || getPublicSupabaseConfigIssue()) {
    return null;
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}

export function createClerkBrowserClient(getToken: () => Promise<string | null>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey || getPublicSupabaseConfigIssue()) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    accessToken: getToken,
  });
}
