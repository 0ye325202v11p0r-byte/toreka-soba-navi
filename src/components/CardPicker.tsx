"use client";

import { useId, useMemo, useState } from "react";
import { dataQualityLabel, isAutoTracked } from "@/lib/format";
import type { DataQuality } from "@/lib/types";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name?: string | null;
  data_quality?: DataQuality | null;
  source_url?: string | null;
}

export default function CardPicker({
  cards,
  value,
  onChange,
  label,
}: {
  cards: CardOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const listboxId = useId();

  const selected = cards.find((c) => c.id === value);

  const matches = useMemo(() => {
    if (!query.trim()) return cards.slice(0, 30);
    const q = query.trim();
    return cards.filter((c) => c.name.includes(q) || (c.set_name ?? "").includes(q)).slice(0, 30);
  }, [cards, query]);

  return (
    <div
      className="relative min-w-40 flex-1"
      onBlur={(e) => {
        // close only when focus actually leaves this whole widget (not when
        // it moves from the input to one of the option buttons below) —
        // a fixed setTimeout here would fight keyboard Tab navigation,
        // closing the list out from under a keyboard-only user before they
        // can reach an option with Tab+Enter
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <label htmlFor={inputId} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={open ? query : selected ? `${selected.name}（${selected.rarity}）` : ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur();
            return;
          }
          if (e.key !== "Enter") return;
          // An Enter that's confirming an IME composition (finalizing a
          // kanji conversion, for example) belongs to the IME, not to this
          // widget — pass it through untouched. isComposing is the
          // standard check; keyCode 229 is a fallback some older
          // Safari/WebKit builds still need during composition.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;

          // Always suppress the browser's implicit form submission for
          // Enter inside a text input, regardless of match count. Without
          // this, pressing Enter while the search hadn't narrowed to
          // exactly one match (0 or 2+ results) submitted whichever form
          // this picker lives in using the PREVIOUS selection — not the
          // card being searched for (found via independent review,
          // 2026-09-12).
          e.preventDefault();
          if (matches.length === 1) {
            onChange(matches[0].id);
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
        placeholder="カード名で検索"
        className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
      />
      {!open && selected && selected.data_quality && selected.data_quality !== "real" && (
        <p className={`mt-1 rounded px-1.5 py-0.5 text-[11px] ${dataQualityLabel(selected.data_quality).cls}`}>
          {dataQualityLabel(selected.data_quality).label}
          {/* Not "=== 'partial'" — any non-auto-tracked card (partial OR
              flat) never gets its price refreshed. Checking only "partial"
              here silently dropped this note for 'flat' cards, the same
              bug class fixed in PortfolioClient/WatchlistClient's own
              warnings (UX review follow-up, 2026-09-12) — caught late
              because this component has its own separate copy of the
              check. */}
          {!isAutoTracked(selected) && "（価格は自動更新されません）"}
        </p>
      )}
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-bg-elevated shadow-lg"
        >
          {matches.length === 0 && (
            <div className="px-3 py-2 text-sm text-ink-faint">該当するカードがありません</div>
          )}
          {matches.map((c) => (
            <button
              type="button"
              key={c.id}
              role="option"
              aria-selected={c.id === value}
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-sunken"
            >
              <span className="flex-1">
                {c.name}（{c.rarity}・{c.set_name}）
              </span>
              {c.data_quality && c.data_quality !== "real" && (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${dataQualityLabel(c.data_quality).cls}`}>
                  {dataQualityLabel(c.data_quality).label}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
