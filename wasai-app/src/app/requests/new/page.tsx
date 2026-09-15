import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import RequestForm from "./RequestForm";

export const metadata = { title: "依頼を投稿する" };

export default async function NewRequestPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect("/login");
  if (current.profile.role !== "client") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">依頼を投稿する</h1>
      <p className="mt-1 text-sm text-ink-muted">和裁士からの提案を待ちます。</p>
      <RequestForm />
    </div>
  );
}
