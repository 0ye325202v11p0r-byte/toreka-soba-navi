import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminUser } from "@/lib/adminAuth";
import SetupNotice from "@/components/SetupNotice";
import VerifyButton from "./VerifyButton";
import type { CraftsmanProfile, Profile } from "@/lib/types";

export const metadata = { title: "和裁士の資格確認（管理）" };

type Row = CraftsmanProfile & { profiles: Profile };

export default async function AdminCraftsmenPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/craftsmen");
  // Not-found rather than a permission error — a non-admin logged-in user
  // isn't missing authentication, the page just isn't theirs to see (same
  // reasoning as the sibling project's /admin/sync-status gate).
  if (!isAdminUser(user.email)) notFound();

  const { data } = await supabase
    .from("craftsman_profiles")
    .select("*, profiles!inner(*)")
    .not("grade", "is", null)
    .order("grade_verified", { ascending: true })
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  // certificate_url is a path in the private "certificates" bucket (Phase
  // 20) — sign it with the service-role client so an admin can view any
  // craftsman's certificate regardless of the storage RLS owner check.
  const admin = adminClient();
  const signedUrls = new Map<string, string>();
  for (const r of rows) {
    if (!r.certificate_url) continue;
    const { data: signed } = await admin.storage
      .from("certificates")
      .createSignedUrl(r.certificate_url, 3600);
    if (signed?.signedUrl) signedUrls.set(r.profile_id, signed.signedUrl);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">和裁士の資格確認</h1>
      <p className="mt-1 text-sm text-ink-muted">
        資格級位を設定している和裁士の一覧。証明書URLの内容を確認できたら「確認済みにする」を押してください。
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        1〜3級は国家検定「和裁技能士」の等級です。証明書が都道府県職業能力開発協会発行の技能検定合格証書かどうかを確認してください
        （公開のオンライン照会はないため、疑わしい場合は本人確認の上で発行元の協会に直接問い合わせてください）。
        「その他資格」は日本和裁士会認定など別団体の資格です。発行団体名が証明書に明記されているか確認してください。
      </p>

      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.profile_id} className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="flex items-center justify-between">
              <Link href={`/craftsmen/${r.profile_id}`} className="font-semibold text-accent-strong hover:underline">
                {r.profiles.display_name}
              </Link>
              <span className="text-sm font-bold">{r.grade}</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {r.grade_verified ? `確認済み（${r.grade_verified_at ?? ""}）` : "未確認"}
            </p>
            {signedUrls.has(r.profile_id) ? (
              <a
                href={signedUrls.get(r.profile_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-sm text-accent-strong underline"
              >
                証明書を確認する
              </a>
            ) : (
              <p className="mt-1 text-sm text-ink-faint">証明書は未登録です。</p>
            )}
            <div className="mt-3">
              <VerifyButton profileId={r.profile_id} verified={r.grade_verified} />
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink-muted">対象がありません。</p>}
      </ul>
    </div>
  );
}
