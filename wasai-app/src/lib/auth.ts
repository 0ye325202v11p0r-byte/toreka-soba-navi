import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Profile } from "@/lib/types";

export interface CurrentUser {
  id: string;
  email: string | null;
  profile: Profile | null;
}

// Fetches the signed-in user's own profile row for use in server components.
// Returns null when signed out or when Supabase isn't configured yet, so
// callers can render a signed-out view without special-casing setup state.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { id: user.id, email: user.email ?? null, profile: (profile as Profile) ?? null };
}
