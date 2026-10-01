import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import RequestForm from "./RequestForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "依頼を投稿する" };

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect(`/login?next=${encodeURIComponent("/requests/new" + ((await searchParams).to ? `?to=${(await searchParams).to}` : ""))}`);
  if (current.profile.role !== "client") {
    redirect("/dashboard");
  }

  // ?to=<craftsman id> from a craftsman's page: 「この和裁士に相談する」.
  const { to } = await searchParams;
  let directed: { id: string; name: string } | null = null;
  if (to) {
    const supabase = await createClient();
    const { data: target } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", to)
      .eq("role", "craftsman")
      .maybeSingle();
    if (target) directed = { id: target.id, name: target.display_name };
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">{directed ? `${directed.name}さんに相談する` : "依頼を投稿する"}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {directed
          ? "仕立てたいものや気になっていることを書いて送ってください。和裁士から見積り（提案）が届きます。"
          : "和裁士からの提案を待ちます。"}
      </p>
      <RequestForm directedTo={directed?.id} directedName={directed?.name} />
    </div>
  );
}
