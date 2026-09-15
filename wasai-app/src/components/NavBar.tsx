import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SITE_NAME } from "@/lib/site";
import LogoutButton from "@/components/LogoutButton";

export default async function NavBar() {
  const user = await getCurrentUser();

  let unreadCount = 0;
  if (user) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    unreadCount = count ?? 0;
  }

  return (
    <header className="border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-accent-strong">
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/craftsmen" className="text-ink-muted hover:text-ink transition-colors">
            和裁士を探す
          </Link>
          <Link href="/services" className="text-ink-muted hover:text-ink transition-colors">
            出品一覧
          </Link>
          <Link href="/requests" className="text-ink-muted hover:text-ink transition-colors">
            依頼掲示板
          </Link>
          <Link href="/market-rates" className="text-ink-muted hover:text-ink transition-colors">
            相場データ
          </Link>
          {user?.profile ? (
            <>
              <Link href="/notifications" className="relative text-ink-muted hover:text-ink transition-colors">
                通知
                {unreadCount > 0 && (
                  <span className="absolute -right-3 -top-2 rounded-full bg-warn px-1.5 py-0.5 text-[10px] font-bold leading-none text-bg-elevated">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/dashboard" className="text-ink-muted hover:text-ink transition-colors">
                マイページ
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink-muted hover:text-ink transition-colors">
                ログイン
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-accent px-3 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors"
              >
                無料登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
