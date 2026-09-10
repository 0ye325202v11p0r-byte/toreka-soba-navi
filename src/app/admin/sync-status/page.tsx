import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";

export const metadata: Metadata = {
  title: "価格更新の実行状況",
};

export default async function SyncStatusPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">価格更新の実行状況</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: runs } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(30);

  const latest = runs?.[0];
  const now = Date.now();
  const hoursSinceLastRun = latest
    ? (now - new Date(latest.started_at).getTime()) / 1000 / 60 / 60
    : null;
  const isStale = hoursSinceLastRun !== null && hoursSinceLastRun > 30; // daily job, allow slack

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">価格更新の実行状況</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Phase 2の自動価格更新（日次クロン）が正常に動いているかを確認するページです。
      </p>

      {!latest && (
        <div className="rounded-lg bg-warn-soft p-4 text-warn">
          まだ実行履歴がありません。デプロイ後、Vercel
          Cronが初回実行されるまでお待ちください。
        </div>
      )}

      {latest && (
        <div
          className={`mb-6 rounded-lg p-4 ${isStale ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}
        >
          {isStale ? (
            <>
              ⚠️ 最終実行から{Math.round(hoursSinceLastRun!)}
              時間経過しています。日次実行のはずなので、クロンが止まっている可能性があります。
            </>
          ) : (
            <>✅ 直近{Math.round(hoursSinceLastRun!)}時間以内に実行されています。正常です。</>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-sunken text-left text-ink-muted">
            <tr>
              <th className="px-3 py-2">開始時刻</th>
              <th className="px-3 py-2 text-right">対象件数</th>
              <th className="px-3 py-2 text-right">成功</th>
              <th className="px-3 py-2 text-right">失敗</th>
              <th className="px-3 py-2">エラー内容（一部）</th>
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(r.started_at).toLocaleString("ja-JP")}
                </td>
                <td className="px-3 py-2 text-right font-mono">{r.total_count}</td>
                <td className="px-3 py-2 text-right font-mono text-good">{r.success_count}</td>
                <td
                  className={`px-3 py-2 text-right font-mono ${r.fail_count > 0 ? "text-warn" : ""}`}
                >
                  {r.fail_count}
                </td>
                <td className="px-3 py-2 text-xs text-ink-faint whitespace-pre-wrap">
                  {r.error_sample ?? "—"}
                </td>
              </tr>
            ))}
            {(!runs || runs.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-faint">
                  実行履歴がありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
