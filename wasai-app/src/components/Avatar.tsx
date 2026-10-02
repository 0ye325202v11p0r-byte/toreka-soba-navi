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

  // No photo: a plain gray person silhouette, the usual "not set" icon.
  // (It used to show the name's first character, which read as a random
  // kanji — 春, 森 — in the middle of cards.)
  return (
    <span
      style={style}
      aria-hidden
      className="flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-bg-sunken"
    >
      <svg viewBox="0 0 24 24" className="h-[82%] w-[82%] text-border-strong" fill="currentColor">
        <circle cx="12" cy="8.5" r="4.5" />
        <path d="M3.5 24c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5z" />
      </svg>
    </span>
  );
}
