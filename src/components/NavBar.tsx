import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import LogoutButton from "./LogoutButton";

export default async function NavBar() {
  const configured = isSupabaseConfigured();
  const user = configured ? (await (await createClient()).auth.getUser()).data.user : null;

  return (
    <header className="border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-ink">
          トレカ相場ナビ
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-ink-muted hover:text-ink">
            相場一覧
          </Link>
          <Link href="/compare" className="text-ink-muted hover:text-ink">
            比較
          </Link>
          {!configured ? null : user ? (
            <>
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
