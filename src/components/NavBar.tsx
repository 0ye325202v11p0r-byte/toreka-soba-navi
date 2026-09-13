import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import LogoutButton from "./LogoutButton";

export default async function NavBar() {
  const configured = isSupabaseConfigured();
  const user = configured ? (await (await createClient()).auth.getUser()).data.user : null;

  return (
    <header className="border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <Link href="/" className="text-base font-bold text-ink sm:text-lg">
          トレカ相場ナビ
        </Link>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:gap-x-4">
          <Link href="/" className="text-ink-muted hover:text-ink">
            相場一覧
          </Link>
          <Link href="/compare" className="text-ink-muted hover:text-ink">
            比較
          </Link>
          <Link href="/weekly-movers" className="text-ink-muted hover:text-ink">
            週間ランキング
          </Link>
          {!configured ? null : user ? (
            <>
              {/* First link in the logged-in nav segment, deliberately —
                  this is meant to be the "come back here" destination (see
                  COORDINATION.md's dashboard design discussion, 2026-09-13):
                  a returning user should land on "what changed with MY
                  cards" before Portfolio/Watchlist's own full item lists. */}
              <Link href="/dashboard" className="text-ink-muted hover:text-ink">
                ダッシュボード
              </Link>
              <Link href="/portfolio" className="text-ink-muted hover:text-ink">
                ポートフォリオ
              </Link>
              <Link href="/watchlist" className="text-ink-muted hover:text-ink">
                ウォッチリスト
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-accent px-3 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong"
            >
              ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
