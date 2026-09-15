export default function SetupNotice() {
  return (
    <div className="rounded-lg border border-warn bg-warn-soft p-4 text-sm text-ink">
      <p className="font-semibold">Supabaseが未設定です</p>
      <p className="mt-1 text-ink-muted">
        <code>.env.local</code> に <code>NEXT_PUBLIC_SUPABASE_URL</code> /{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を設定し、
        <code>supabase/schema.sql</code> をSupabaseのSQL Editorで実行してください。詳細はREADME参照。
      </p>
    </div>
  );
}
