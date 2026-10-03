import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { getRatingSummary } from "@/lib/reviews";
import StarRating from "@/components/StarRating";
import SetupNotice from "@/components/SetupNotice";
import OrderButton from "./OrderButton";
import GarmentChip from "@/components/GarmentChip";
import ImageUploadButton from "@/components/ImageUploadButton";
import { setServiceImage, removeServiceImage } from "./actions";
import PrePaymentSummary from "@/components/PrePaymentSummary";
import { deliveryNote } from "@/lib/orderTerms";
import ManageServiceButtons from "./ManageServiceButtons";
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
  const consultHref = `/requests/new?to=${service.craftsman_id}&menu=${service.id}`;

  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <div className="sm:col-span-2">
        {service.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL, no Next Image domain config
          <img src={service.image_url} alt={service.title} className="mb-4 aspect-[16/9] w-full rounded-lg object-cover" />
        )}
        <GarmentChip garmentType={service.garment_type} />
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
          <Link href={`/craftsmen/${service.craftsman_id}`} className="font-semibold text-ink hover:underline">
            {service.profiles.display_name}
          </Link>
          <div className="mt-1">
            <StarRating rating={rating.average} count={rating.count} href={`/craftsmen/${service.craftsman_id}#reviews`} />
          </div>
        </div>

        <div className="mt-4">
          {isOwner ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs text-ink-muted">メニューの写真（一覧とこのページに表示されます）</p>
                <ImageUploadButton
                  upload={setServiceImage}
                  remove={removeServiceImage}
                  fields={{ service_id: service.id }}
                  hasImage={Boolean(service.image_url)}
                  label="写真"
                />
              </div>
              <ManageServiceButtons serviceId={service.id} published={service.status === "published"} />
            </div>
          ) : (
            // Trial feedback: going straight from the menu to the payment
            // screen felt too fast — the client hasn't said their sizes or
            // wishes yet. 相談 first (a 相談 to this craftsman, with the menu
            // filled in → the craftsman's 見積り → 申し込み・お支払い), and
            // paying right away stays available for those who've settled it.
            <div className="space-y-3">
              <Link
                href={current ? consultHref : `/login?next=${encodeURIComponent(consultHref)}`}
                className="block rounded-md bg-accent px-4 py-3 text-center font-semibold text-bg-elevated transition-colors hover:bg-accent-strong"
              >
                このメニューで相談する
              </Link>
              <p className="text-xs text-ink-muted">
                寸法や希望を伝えて、和裁士から見積り（提案）をもらいます。内容と金額に納得してから申し込み・お支払いに進めます。
              </p>
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">相談せずに、すぐ申し込む</summary>
                <p className="mt-2 text-xs text-ink-muted">
                  内容と寸法がもう決まっている方向けです。申し込み後、取引のメッセージで寸法などを伝えます。
                </p>
                <div className="mt-3 space-y-3">
                  <PrePaymentSummary
                    price={service.price}
                    delivery={deliveryNote({ deliveryDays: service.delivery_days })}
                  />
                  <OrderButton serviceId={service.id} />
                </div>
              </details>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
