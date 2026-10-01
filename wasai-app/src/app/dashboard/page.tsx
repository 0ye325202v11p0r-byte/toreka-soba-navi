import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/adminAuth";
import { adminClient } from "@/lib/supabase/admin";
import SetupNotice from "@/components/SetupNotice";
import Avatar from "@/components/Avatar";
import type { JobRequest, Order, Profile, Proposal, Service } from "@/lib/types";

export const metadata = { title: "マイページ" };

const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  pending_payment: "支払い待ち",
  in_progress: "進行中",
  delivered: "納品済み",
  completed: "完了",
  cancelled: "キャンセル",
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect("/login");

  const supabase = await createClient();
  const isClient = current.profile.role === "client";

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq(isClient ? "client_id" : "craftsman_id", current.id)
    .order("created_at", { ascending: false })
    .returns<Order[]>();

  let requests: JobRequest[] = [];
  let services: Service[] = [];
  let proposals: (Proposal & { requests: JobRequest })[] = [];
  let pastCraftsmen: Profile[] = [];
  let favoriteCraftsmen: Profile[] = [];
  let directedRequests: JobRequest[] = [];

  if (isClient) {
    const { data } = await supabase
      .from("requests")
      .select("*")
      .eq("client_id", current.id)
      .order("created_at", { ascending: false })
      .returns<JobRequest[]>();
    requests = data ?? [];

    // Once matched with a craftsman, a client has no reason to come back to
    // the site for the next job unless it's at least as easy as texting them
    // directly — surface past craftsmen with a one-tap link back to their
    // profile (which lists their orderable services) instead of leaving that
    // to memory.
    const { data: completedOrders } = await supabase
      .from("orders")
      .select("craftsman_id")
      .eq("client_id", current.id)
      .eq("status", "completed")
      .returns<Pick<Order, "craftsman_id">[]>();
    const craftsmanIds = Array.from(new Set((completedOrders ?? []).map((o) => o.craftsman_id)));
    if (craftsmanIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", craftsmanIds)
        .returns<Profile[]>();
      pastCraftsmen = profilesData ?? [];
    }

    // お気に入り (Phase 33) — the client's own list, newest first.
    const { data: favoriteRows } = await supabase
      .from("favorites")
      .select("craftsman_id, profiles!favorites_craftsman_id_fkey(*)")
      .eq("client_id", current.id)
      .order("created_at", { ascending: false });
    favoriteCraftsmen = ((favoriteRows ?? []) as unknown as { profiles: Profile }[]).map((r) => r.profiles).filter(Boolean);
  } else {
    // 指名依頼 sent to this craftsman that are still open (Phase 33).
    const { data: directedData } = await supabase
      .from("requests")
      .select("*")
      .eq("directed_to", current.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .returns<JobRequest[]>();
    directedRequests = directedData ?? [];

    const { data: serviceData } = await supabase
      .from("services")
      .select("*")
      .eq("craftsman_id", current.id)
      .order("created_at", { ascending: false })
      .returns<Service[]>();
    services = serviceData ?? [];

    const { data: proposalData } = await supabase
      .from("proposals")
      .select("*, requests(*)")
      .eq("craftsman_id", current.id)
      .order("created_at", { ascending: false });
    proposals = (proposalData ?? []) as unknown as (Proposal & { requests: JobRequest })[];
  }

  // The operator's only prompt that a client asked them to step in on a
  // delivered order (Phase 30) — there's no email notification.
  let openDisputes: number | null = null;
  let openInquiries = 0;
  if (isAdminUser(current.email)) {
    const admin = adminClient();
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered")
      .not("disputed_at", "is", null);
    openDisputes = count ?? 0;
    // /contact inquiries waiting for a reply (Phase 33) — the operator's
    // only prompt, there's no email notification.
    const { count: inquiryCount } = await admin
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    openInquiries = inquiryCount ?? 0;
  }

  return (
    <div>
      {openDisputes !== null && (
        <p
          className={`mb-4 rounded-md p-3 text-sm ${
            openDisputes > 0 || openInquiries > 0 ? "bg-warn-soft text-warn" : "bg-bg-elevated text-ink-muted"
          }`}
        >
          運営：相談中の取引 {openDisputes}件・未対応のお問い合わせ {openInquiries}件 ・{" "}
          <Link href="/admin/orders" className="underline">
            相談中の取引
          </Link>{" "}
          ・{" "}
          <Link href="/admin/inquiries" className="underline">
            お問い合わせ
          </Link>{" "}
          ・{" "}
          <Link href="/admin/craftsmen" className="underline">
            資格の確認
          </Link>
        </p>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">マイページ</h1>
        <div className="flex gap-4">
          {!isClient && (
            <Link href="/dashboard/payouts" className="text-sm text-link underline">
              振込先の設定
            </Link>
          )}
          <Link href="/dashboard/profile" className="text-sm text-link underline">
            プロフィールを編集
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        こんにちは、{current.profile.display_name}さん（
        {isClient ? "依頼者" : "和裁士"}
        アカウント）
      </p>

      {isClient ? (
        <>
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">投稿した依頼</h2>
              <Link href="/requests/new" className="text-sm text-link underline">
                新しい依頼を投稿
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <Link href={`/requests/${r.id}`} className="font-semibold text-ink hover:underline">
                    {r.title}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {r.status === "open" ? "募集中" : r.status === "matched" ? "マッチング済み" : "締め切り済み"}
                  </p>
                </li>
              ))}
              {requests.length === 0 && <p className="text-sm text-ink-muted">まだ依頼を投稿していません。</p>}
            </ul>
          </section>

          {favoriteCraftsmen.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold">お気に入りの和裁士</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {favoriteCraftsmen.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                    <Link href={`/craftsmen/${p.id}`} className="flex items-center gap-3">
                      <Avatar url={p.avatar_url} name={p.display_name} size={40} />
                      <span className="font-semibold text-ink hover:underline">{p.display_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pastCraftsmen.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold">また依頼したい和裁士</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {pastCraftsmen.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                    <Link href={`/craftsmen/${p.id}`} className="flex items-center gap-3">
                      <Avatar url={p.avatar_url} name={p.display_name} size={40} />
                      <span className="font-semibold text-ink hover:underline">{p.display_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          {directedRequests.length > 0 && (
            <section className="mt-6 rounded-lg border border-link bg-link-soft p-4">
              <h2 className="text-lg font-bold">あなたへの相談</h2>
              <p className="mt-1 text-sm text-ink-muted">依頼者からあなたにだけ届いた相談です。内容を見て、見積り（提案）を送ってください。</p>
              <ul className="mt-3 space-y-2">
                {directedRequests.map((r) => (
                  <li key={r.id} className="rounded-md border border-border bg-bg-elevated p-3">
                    <Link href={`/requests/${r.id}`} className="font-semibold text-ink hover:underline">
                      {r.title}
                    </Link>
                    <p className="text-xs text-ink-muted">{r.garment_type}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">出品中のサービス</h2>
              <Link href="/services/new" className="text-sm text-link underline">
                新しく出品する
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {services.map((s) => (
                <li key={s.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <Link href={`/services/${s.id}`} className="font-semibold text-ink hover:underline">
                    {s.title}
                  </Link>
                  {s.status !== "published" && (
                    <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">停止中</span>
                  )}
                  <p className="text-xs text-ink-muted">¥{s.price.toLocaleString()}〜</p>
                </li>
              ))}
              {services.length === 0 && <p className="text-sm text-ink-muted">まだ出品していません。</p>}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-bold">送った提案</h2>
            <ul className="mt-3 space-y-2">
              {proposals.map((p) => (
                <li key={p.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <Link href={`/requests/${p.request_id}`} className="font-semibold text-ink hover:underline">
                    {p.requests.title}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    ¥{p.price.toLocaleString()} ・{" "}
                    {p.status === "pending"
                      ? "検討中"
                      : p.status === "countered"
                        ? "価格交渉中"
                        : p.status === "accepted"
                          ? "承諾済み"
                          : p.status === "declined"
                            ? "見送り"
                            : "取り下げ"}
                  </p>
                </li>
              ))}
              {proposals.length === 0 && <p className="text-sm text-ink-muted">まだ提案を送っていません。</p>}
            </ul>
          </section>
        </>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-bold">取引</h2>
        <ul className="mt-3 space-y-2">
          {(orders ?? []).map((o) => (
            <li key={o.id} className="rounded-lg border border-border bg-bg-elevated p-3">
              <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:underline">
                {o.title}
              </Link>
              <p className="text-xs text-ink-muted">
                ¥{o.price.toLocaleString()} ・ {ORDER_STATUS_LABEL[o.status]}
              </p>
            </li>
          ))}
          {(orders ?? []).length === 0 && <p className="text-sm text-ink-muted">まだ取引がありません。</p>}
        </ul>
      </section>
    </div>
  );
}
