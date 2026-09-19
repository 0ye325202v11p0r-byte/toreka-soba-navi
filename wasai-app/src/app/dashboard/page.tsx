import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
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
  } else {
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">マイページ</h1>
        <div className="flex gap-4">
          {!isClient && (
            <Link href="/dashboard/payouts" className="text-sm text-accent-strong underline">
              振込先の設定
            </Link>
          )}
          <Link href="/dashboard/profile" className="text-sm text-accent-strong underline">
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
              <Link href="/requests/new" className="text-sm text-accent-strong underline">
                新しい依頼を投稿
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <Link href={`/requests/${r.id}`} className="font-semibold text-accent-strong hover:underline">
                    {r.title}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {r.status === "open" ? "募集中" : r.status === "matched" ? "マッチング済み" : "終了"}
                  </p>
                </li>
              ))}
              {requests.length === 0 && <p className="text-sm text-ink-muted">まだ依頼を投稿していません。</p>}
            </ul>
          </section>

          {pastCraftsmen.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold">また依頼したい和裁士</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {pastCraftsmen.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                    <Link href={`/craftsmen/${p.id}`} className="flex items-center gap-3">
                      <Avatar url={p.avatar_url} name={p.display_name} size={40} />
                      <span className="font-semibold text-accent-strong hover:underline">{p.display_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">出品中のサービス</h2>
              <Link href="/services/new" className="text-sm text-accent-strong underline">
                新しく出品する
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {services.map((s) => (
                <li key={s.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <Link href={`/services/${s.id}`} className="font-semibold text-accent-strong hover:underline">
                    {s.title}
                  </Link>
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
                  <Link href={`/requests/${p.request_id}`} className="font-semibold text-accent-strong hover:underline">
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
              <Link href={`/orders/${o.id}`} className="font-semibold text-accent-strong hover:underline">
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
