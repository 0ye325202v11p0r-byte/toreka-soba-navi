import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import ProfileForm from "./ProfileForm";
import type { CraftsmanProfile, CraftsmanRate } from "@/lib/types";

export const metadata = { title: "プロフィール編集" };

export default async function ProfileEditPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect("/login");

  let craftsmanProfile: CraftsmanProfile | null = null;
  let rates: CraftsmanRate[] = [];
  let certificateSignedUrl: string | null = null;
  if (current.profile.role === "craftsman") {
    const supabase = await createClient();
    // The craftsman's own row, private columns included (certificate_url) —
    // not readable through the user's own client since Phase 32.
    const { data } = await adminClient()
      .from("craftsman_profiles")
      .select("*")
      .eq("profile_id", current.id)
      .maybeSingle<CraftsmanProfile>();
    craftsmanProfile = data ?? null;

    const { data: rateRows } = await supabase
      .from("craftsman_rates")
      .select("*")
      .eq("craftsman_id", current.id)
      .returns<CraftsmanRate[]>();
    rates = rateRows ?? [];

    // certificate_url is a private-bucket path (see Phase 20), not a
    // ready-to-use URL — the owner's own RLS-scoped client can still sign
    // it since the storage policy allows reading files under their own uid.
    if (craftsmanProfile?.certificate_url) {
      const { data: signed } = await supabase.storage
        .from("certificates")
        .createSignedUrl(craftsmanProfile.certificate_url, 3600);
      certificateSignedUrl = signed?.signedUrl ?? null;
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">プロフィール編集</h1>
      <ProfileForm
        profile={current.profile}
        craftsmanProfile={craftsmanProfile}
        rates={rates}
        certificateSignedUrl={certificateSignedUrl}
      />
    </div>
  );
}
