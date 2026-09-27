import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import ServiceForm from "./ServiceForm";

export const metadata = { title: "サービスを出品する" };

export default async function NewServicePage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect("/login");
  if (current.profile.role !== "craftsman") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">サービスを出品する</h1>
      <p className="mt-1 text-sm text-ink-muted">固定価格のメニューとして依頼者に表示されます。</p>
      <ServiceForm />
    </div>
  );
}
