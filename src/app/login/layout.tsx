import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  description: "メールアドレスだけでログインできます（パスワード不要）。",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
