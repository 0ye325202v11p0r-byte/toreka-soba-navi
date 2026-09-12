// Pure CSV-building logic for the portfolio's "取引履歴をCSVで保存"
// button (added 2026-09-13, roadmap item — a paid P&L tool should let a
// user get their own records out for tax/record-keeping purposes, not just
// view them in-browser). Kept framework-free and separate from the actual
// browser download trigger (Blob/URL.createObjectURL/<a> click, which
// can't run in Node) so the string-building — the part with actual logic
// worth getting wrong — is directly unit-testable.
export interface CsvTransactionRow {
  transaction_date: string;
  type: "buy" | "sell";
  card_id: string;
  card_name: string;
  quantity: number;
  price_per_unit: number;
  fee: number;
}

const CSV_HEADER = ["取引日", "種別", "カードID", "カード名", "数量", "単価", "手数料", "合計金額"];

// RFC 4180-style escaping: a field containing a comma, double quote, or
// newline must be wrapped in double quotes, with any internal double quote
// doubled. Card names are free text (this project's own catalog scripts
// have found genuinely unusual characters in scraped names before), so
// this can't be skipped just because it "probably" won't happen.
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Total actually paid (buy) or received (sell), fee-inclusive — matches
// src/lib/pnl.ts's own effective-cost/effective-proceeds calculation, so a
// user reconciling this CSV against the in-app 含み損益/実現損益 sees
// consistent numbers rather than two different definitions of "total."
function rowTotal(row: CsvTransactionRow): number {
  return row.type === "buy"
    ? row.quantity * row.price_per_unit + row.fee
    : row.quantity * row.price_per_unit - row.fee;
}

export function buildTransactionsCsv(rows: CsvTransactionRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.transaction_date,
        row.type === "buy" ? "購入" : "売却",
        escapeCsvField(row.card_id),
        escapeCsvField(row.card_name),
        String(row.quantity),
        String(row.price_per_unit),
        String(row.fee),
        String(rowTotal(row)),
      ].join(",")
    );
  }
  // CRLF line endings — the conventional choice for CSV (RFC 4180) and
  // what most Windows-based accounting/spreadsheet tools expect, matching
  // this project's Japanese, largely Windows-desktop audience.
  return lines.join("\r\n");
}
