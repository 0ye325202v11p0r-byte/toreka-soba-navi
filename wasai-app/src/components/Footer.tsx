import { SITE_NAME } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-elevated">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-ink-faint">
        <p>
          {SITE_NAME}は和裁士と依頼者を直接つなぐマッチングサービスです。仕立て代金の決済・エスクローは今後実装予定で、現時点では見積り確定後の支払い方法は当事者間の合意によります。
        </p>
        <p className="mt-2">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
