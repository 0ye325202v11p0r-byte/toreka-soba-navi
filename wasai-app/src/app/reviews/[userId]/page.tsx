import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { getRatingSummary, getReviewsWithContext } from "@/lib/reviews";
import SetupNotice from "@/components/SetupNotice";
import Avatar from "@/components/Avatar";
import ReviewList from "@/components/ReviewList";
import type { Profile } from "@/lib/types";

export const metadata = { title: "評価の一覧", robots: { index: false, follow: false } };

// The list behind a client's stars on the request board: what craftsmen
// said after working with them. A craftsman's reviews live on their own
// page. Signed-in users only — this is for a craftsman deciding whether to
// take on a client, not a public profile of the client.
export default async function ReviewsPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { userId } = await params;

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  if (!profile) notFound();
  if (profile.role === "craftsman") redirect(`/craftsmen/${userId}#reviews`);

  const current = await getCurrentUser();
  if (!current) redirect(`/login?next=${encodeURIComponent(`/reviews/${userId}`)}`);

  const [summary, reviews] = await Promise.all([getRatingSummary(supabase, userId), getReviewsWithContext(supabase, userId)]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <Avatar url={profile.avatar_url} name={profile.display_name} size={48} />
        <div>
          <h1 className="text-xl font-bold">{profile.display_name}さんの評価</h1>
          <p className="text-sm text-ink-muted">依頼者として、取引した和裁士から受けた評価です。</p>
        </div>
      </div>
      <div className="mt-4">
        <ReviewList summary={summary} reviews={reviews} />
      </div>
    </div>
  );
}
