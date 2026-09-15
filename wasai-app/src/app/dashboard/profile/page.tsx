import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import ProfileForm from "./ProfileForm";
import type { CraftsmanProfile } from "@/lib/types";

export const metadata = { title: "プロフィール編集" };

export default async function ProfileEditPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect("/login");

  let craftsmanProfile: CraftsmanProfile | null = null;
  if (current.profile.role === "craftsman") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("craftsman_profiles")
      .select("*")
      .eq("profile_id", current.id)
      .maybeSingle<CraftsmanProfile>();
    craftsmanProfile = data ?? null;
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">プロフィール編集</h1>
      <ProfileForm profile={current.profile} craftsmanProfile={craftsmanProfile} />
    </div>
  );
}
