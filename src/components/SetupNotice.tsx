export default function SetupNotice() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-bg-elevated p-6">
      <h2 className="mb-2 font-bold">Supabaseがまだ設定されていません</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            supabase.com
          </a>
          で無料プロジェクトを作成
        </li>
        <li>SQL Editorで supabase/schema.sql の内容を実行</li>
        <li>
          Project Settings → API から Project URL / anon public key / service_role key を取得
        </li>
        <li>
          .env.local.example を .env.local にコピーして値を埋める
        </li>
        <li>開発サーバーを再起動</li>
      </ol>
    </div>
  );
}
