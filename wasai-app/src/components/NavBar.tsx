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
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-bold text-accent-strong">
          {SITE_NAME}
        </Link>
        {/* overflow-x-auto (not flex-wrap) so a narrow phone screen scrolls
            the nav horizontally instead of each Link's text wrapping
            vertically inside a squeezed flex item — flex-shrink otherwise
            shrinks these below their content width with nothing to stop it. */}
        <nav className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto text-sm">
          <Link href="/craftsmen" className="shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors">
            和裁士を探す
          </Link>
          <Link href="/services" className="shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors">
            出品一覧
          </Link>
          <Link href="/requests" className="shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors">
            依頼掲示板
          </Link>
          <Link href="/market-rates" className="shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors">
            相場データ
          </Link>
          {user?.profile ? (
            <>
              <Link
                href="/notifications"
                className="relative shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors"
              >
                通知
                {unreadCount > 0 && (
                  <span className="absolute -right-3 -top-2 rounded-full bg-warn px-1.5 py-0.5 text-[10px] font-bold leading-none text-bg-elevated">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/dashboard" className="shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors">
                マイページ
              </Link>
              <span className="shrink-0 whitespace-nowrap">
                <LogoutButton />
              </span>
            </>
          ) : (
            <>
              <Link href="/login" className="shrink-0 whitespace-nowrap text-ink-muted hover:text-ink transition-colors">
                ログイン
              </Link>
              <Link
                href="/signup"
                className="shrink-0 whitespace-nowrap rounded-md bg-accent px-3 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors"
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
