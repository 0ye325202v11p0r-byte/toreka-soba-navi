"use client";

import { useId, useMemo, useState } from "react";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name?: string | null;
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

  const selected = cards.find((c) => c.id === value);

  const matches = useMemo(() => {
    if (!query.trim()) return cards.slice(0, 30);
    const q = query.trim();
    return cards.filter((c) => c.name.includes(q) || (c.set_name ?? "").includes(q)).slice(0, 30);
  }, [cards, query]);

  return (
    <div className="relative min-w-40 flex-1">
      <label htmlFor={inputId} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={open ? query : selected ? `${selected.name}（${selected.rarity}）` : ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="カード名で検索"
        className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-bg-elevated shadow-lg">
          {matches.length === 0 && (
            <div className="px-3 py-2 text-sm text-ink-faint">該当するカードがありません</div>
          )}
          {matches.map((c) => (
            <button
              type="button"
              key={c.id}
              onMouseDown={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-bg-sunken"
            >
              {c.name}（{c.rarity}・{c.set_name}）
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
