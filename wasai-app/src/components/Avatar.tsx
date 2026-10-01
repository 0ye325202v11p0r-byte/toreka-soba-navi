// avatar_url is either an uploaded file's public Storage URL or a pasted
// external URL — both are just URLs by the time they reach this component.
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
      className="flex shrink-0 items-center justify-center rounded-full bg-bg-sunken text-sm font-semibold text-ink-muted"
    >
      {initial}
    </span>
  );
}
