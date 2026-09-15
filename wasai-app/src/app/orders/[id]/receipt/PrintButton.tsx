"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-elevated hover:bg-accent-strong transition-colors print:hidden"
    >
      印刷 / PDF保存
    </button>
  );
}
