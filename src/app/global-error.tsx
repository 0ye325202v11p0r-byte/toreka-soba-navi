"use client";

// Catches errors thrown by the ROOT layout.tsx itself (e.g. NavBar's async
// Supabase auth check) — added 2026-09-14 after confirming via Next.js's
// own docs that src/app/error.tsx, despite its internal function being
// named "GlobalError", does NOT actually cover this case: "error.js...
// does not wrap the layout.js... above it in the same segment. To handle
// errors in the root layout, use global-error.js" (Next.js docs,
// api-reference/file-conventions/error). Without this file, a failure in
// the root layout (not just an individual page) would fall through to
// Next.js's own unstyled default error screen instead of anything
// matching this app's design.
//
// Must define its own <html>/<body> and cannot rely on globals.css/
// Tailwind (this file replaces the root layout entirely when active, per
// the same docs) — colors are inlined from globals.css's own custom
// property values rather than reusing Tailwind classes that won't be
// available here, with a prefers-color-scheme media query for the same
// light/dark support the rest of the app has (the app's own manual
// [data-theme] override can't reach this file either, per Next.js's
// documented limitation — not fixable from here).
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>
        <style>{`
          :root { --bg: #efe7d2; --bg-elevated: #fbf7ea; --ink: #1e2a38; --ink-muted: #63625a; --ink-faint: #6e6858; --accent: #a9741f; --accent-strong: #7e5514; }
          @media (prefers-color-scheme: dark) {
            :root { --bg: #14191f; --bg-elevated: #1d2430; --ink: #ece6d6; --ink-muted: #a9a79a; --ink-faint: #9c9b8e; --accent: #d9a63d; --accent-strong: #f0be5c; }
          }
        `}</style>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "20px",
            textAlign: "center",
            background: "var(--bg)",
            color: "var(--ink)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>エラーが発生しました</h1>
          <p style={{ marginBottom: 4, fontSize: 14, color: "var(--ink-muted)" }}>
            予期しない問題が発生しました。もう一度お試しください。
          </p>
          {error.message && (
            <p style={{ marginBottom: 24, maxWidth: 420, fontSize: 12, color: "var(--ink-faint)" }}>
              {error.message}
            </p>
          )}
          <button
            onClick={() => retry()}
            style={{
              borderRadius: 6,
              background: "var(--accent)",
              color: "var(--bg-elevated)",
              padding: "8px 16px",
              fontWeight: 600,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
            }}
          >
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  );
}
