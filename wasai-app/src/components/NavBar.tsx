import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SITE_NAME } from "@/lib/site";
import LogoutButton from "@/components/LogoutButton";
import { NavLink } from "@/components/NavLinks";

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


  // Phones: the logo and the account actions (登録・ログイン / 通知・マイページ)
  // share the first row and the browse links wrap onto a second row, so
  // nothing a visitor needs sits off-screen. (Previously everything was in
  // one horizontally scrolling row, and on a 390px phone the signup and
  // マイページ links were hidden past the right edge with no visible cue.)
  // From sm up it's one row: logo, links, then the account actions.
  return (
    <header className="border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:py-3">
        <Link href="/" className="order-1 shrink-0 py-1 text-lg font-bold text-accent-strong">
          {SITE_NAME}
        </Link>
        <div className="order-2 ml-auto flex items-center gap-4 text-sm sm:order-3">
          {user?.profile ? (
            <>
              <NavLink href="/notifications" className="relative">
                通知
                {unreadCount > 0 && (
                  <span className="absolute -right-3 -top-1 rounded-full bg-warn px-1.5 py-0.5 text-[10px] font-bold leading-none text-bg-elevated">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </NavLink>
              <NavLink href="/dashboard">マイページ</NavLink>
              <LogoutButton />
            </>
          ) : (
            <>
              <NavLink href="/login">ログイン</NavLink>
              <Link
                href="/signup"
                className="shrink-0 whitespace-nowrap rounded-md bg-accent px-3 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors"
              >
                無料登録
              </Link>
            </>
          )}
        </div>
        <nav className="order-3 flex w-full flex-wrap gap-x-4 gap-y-1 text-sm sm:order-2 sm:w-auto sm:flex-1">
          <NavLink href="/craftsmen">和裁士を探す</NavLink>
          <NavLink href="/services">出品一覧</NavLink>
          <NavLink href="/requests">依頼掲示板</NavLink>
          <NavLink href="/market-rates">相場データ</NavLink>
        </nav>
      </div>
    </header>
  );
}
