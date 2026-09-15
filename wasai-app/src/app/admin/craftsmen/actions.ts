"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/adminAuth";

export interface VerifyGradeState {
  error?: string;
}

export async function setGradeVerified(
  _prevState: VerifyGradeState,
  formData: FormData
): Promise<VerifyGradeState> {
  const profileId = String(formData.get("profile_id") ?? "");
  const verified = formData.get("verified") === "true";
  if (!profileId) return { error: "対象が見つかりません。" };

  // Identify the caller via their own session first — the actual write
  // below uses the service-role client (required: the DB trigger on
  // craftsman_profiles only allows grade_verified to become true when the
  // request comes in as service_role, precisely so this admin check can't
  // be bypassed by a craftsman hitting the REST API directly).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) return { error: "権限がありません。" };

  const admin = adminClient();
  const { error } = await admin
    .from("craftsman_profiles")
    .update({
      grade_verified: verified,
      grade_verified_at: verified ? new Date().toISOString() : null,
    })
    .eq("profile_id", profileId);

  if (error) return { error: error.message };

  revalidatePath("/admin/craftsmen");
  return {};
}
