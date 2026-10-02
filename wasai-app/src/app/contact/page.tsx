import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { INQUIRY_CATEGORIES } from "@/lib/inquiries";
import ContactForm from "./ContactForm";

export const metadata: Metadata = { title: "お問い合わせ" };

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const current = await getCurrentUser();
  const defaultCategory = INQUIRY_CATEGORIES.find((c) => c === category) ?? "";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">お問い合わせ</h1>
      <p className="mt-1 text-sm text-ink-muted">
        サービス・お取引・個人情報などに関するお問い合わせは、こちらのフォームからお送りください。運営者から、入力いただいたメールアドレスに返信します。
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        ご本人からの個人情報の開示等のご請求は、和裁マッチにログインした状態で送っていただくと、ご本人の確認が簡単になります。
      </p>
      <ContactForm
        defaultName={current?.profile?.display_name ?? ""}
        defaultEmail={current?.email ?? ""}
        defaultCategory={defaultCategory}
      />
    </div>
  );
}
