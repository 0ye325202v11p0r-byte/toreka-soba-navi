import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminUser } from "@/lib/adminAuth";
import SetupNotice from "@/components/SetupNotice";
import StatusButton from "./StatusButton";

export const metadata = { title: "お問い合わせ（管理）" };

interface Inquiry {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  category: string;
  body: string;
  status: "open" | "closed";
  created_at: string;
}

// The operator's inbox for /contact (Phase 33). Reply from your own mail to
// the address each person entered.
export default async function AdminInquiriesPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/inquiries");
  if (!isAdminUser(user.email)) notFound();

  const { data } = await adminClient()
    .from("inquiries")
    .select("*")
    .order("status", { ascending: false }) // "open" before "closed"
    .order("created_at", { ascending: false })
    .limit(200);
  const inquiries = (data ?? []) as Inquiry[];

  return (
    <div>
      <h1 className="text-2xl font-bold">お問い合わせ</h1>
      <p className="mt-1 text-sm text-ink-muted">
        お問い合わせフォームから届いたものです。各メールアドレスに返信し、済んだら「対応済みにする」を押してください。「特商法の表示事項の請求」には、氏名・住所・電話番号を遅滞なく返信してください。
      </p>
      <ul className="mt-6 space-y-3">
        {inquiries.map((q) => (
          <li
            key={q.id}
            className={`rounded-lg border p-4 ${q.status === "open" ? "border-warn bg-bg-elevated" : "border-border bg-bg"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {q.status === "open" ? "【未対応】" : "【対応済み】"}
                {q.category}
              </p>
              <p className="text-xs text-ink-muted">{q.created_at.slice(0, 16).replace("T", " ")}</p>
            </div>
            <p className="mt-1 text-sm">
              {q.name} ・ <a href={`mailto:${q.email}`} className="text-accent-strong underline">{q.email}</a>
              {q.user_id ? " ・ ログイン中に送信" : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{q.body}</p>
            <div className="mt-3">
              <StatusButton id={q.id} closed={q.status === "closed"} />
            </div>
          </li>
        ))}
        {inquiries.length === 0 && <p className="text-sm text-ink-muted">お問い合わせはまだありません。</p>}
      </ul>
    </div>
  );
}
