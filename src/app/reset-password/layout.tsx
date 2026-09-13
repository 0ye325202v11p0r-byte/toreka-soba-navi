import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "パスワードの再設定",
  description: "新しいパスワードを設定します。",
  // Reached only via a one-time, per-user recovery link — the page itself
  // is non-functional without one (updateUser() fails with no valid
  // recovery session), so it has no evergreen content worth surfacing in
  // search results the way /login does.
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
