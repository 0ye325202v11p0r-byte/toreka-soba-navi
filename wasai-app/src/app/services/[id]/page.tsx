import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { getRatingSummary } from "@/lib/reviews";
import StarRating from "@/components/StarRating";
import SetupNotice from "@/components/SetupNotice";
import OrderButton from "./OrderButton";
import type { Service, Profile } from "@/lib/types";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select("*, profiles(*)")
    .eq("id", id)
    .maybeSingle<Service & { profiles: Profile }>();

  if (!service) notFound();

  const rating = await getRatingSummary(supabase, service.craftsman_id);
  const current = await getCurrentUser();
  const isOwner = current?.id === service.craftsman_id;

  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <p className="text-xs text-ink-muted">{service.garment_type}</p>
        <h1 className="mt-1 text-2xl font-bold">{service.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm">{service.description}</p>
      </div>

      <aside className="rounded-lg border border-border bg-bg-elevated p-4">
        <p className="text-2xl font-bold">¥{service.price.toLocaleString()}</p>
        <dl className="mt-3 space-y-1 text-sm text-ink-muted">
          <div className="flex justify-between">
            <dt>納期目安</dt>
            <dd>{service.delivery_days}日</dd>
          </div>
          <div className="flex justify-between">
            <dt>修正回数</dt>
            <dd>{service.revision_count}回</dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-border pt-4">
          <Link href={`/craftsmen/${service.craftsman_id}`} className="font-semibold text-accent-strong hover:underline">
            {service.profiles.display_name}
          </Link>
          <div className="mt-1">
            <StarRating rating={rating.average} count={rating.count} />
          </div>
        </div>

        <div className="mt-4">
          {isOwner ? (
            <p className="text-sm text-ink-muted">自分が出品したサービスです。</p>
          ) : (
            <OrderButton serviceId={service.id} />
          )}
        </div>
      </aside>
    </div>
  );
}
