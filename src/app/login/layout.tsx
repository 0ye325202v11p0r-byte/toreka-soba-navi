import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  description: "メールアドレスとパスワードでログイン・新規登録できます。",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
