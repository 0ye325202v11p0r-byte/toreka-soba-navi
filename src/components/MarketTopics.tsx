import { MARKET_TOPICS } from "@/content/marketTopics";

export default function MarketTopics() {
  if (MARKET_TOPICS.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="mb-3 text-sm font-bold text-ink-muted">📰 今週の相場トピック</h2>
      <div className="space-y-4">
        {MARKET_TOPICS.map((topic) => (
          <div key={topic.id}>
            <h3 className="text-sm font-semibold text-ink">{topic.title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{topic.body}</p>
            <p className="mt-1 text-xs text-ink-faint">調査日：{topic.researchedAt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
