// No Supabase Storage integration yet (see README "未実装"), so avatar_url
// is a pasted external URL — same pattern as craftsman_profiles.portfolio_urls.
// Falls back to a colored initial circle when unset, rather than a broken
// image or blank space.
export default function Avatar({
  url,
  name,
  size = 40,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const style = { width: size, height: size };

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs, no Next Image domain config in this MVP
      <img
        src={url}
        alt={name}
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  const initial = name.trim().charAt(0) || "?";
  return (
    <span
      style={style}
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
    >
      {initial}
    </span>
  );
}
