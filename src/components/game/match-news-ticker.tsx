"use client";

import { useEffect, useRef } from "react";
import type { MatchNewsSnapshot } from "@/lib/lobby/types";

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  good_news: { bg: "bg-green-950/70", border: "border-green-700/50", text: "text-green-300", label: "Good News" },
  bad_news: { bg: "bg-rose-950/70", border: "border-rose-700/50", text: "text-rose-300", label: "Bad News" },
  secret_weapon: { bg: "bg-violet-950/70", border: "border-violet-700/50", text: "text-violet-300", label: "Geheimwaffe" },
  injury: { bg: "bg-amber-950/70", border: "border-amber-700/50", text: "text-amber-300", label: "Verletzung" },
};

function formatTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MatchNewsTicker({ news }: { news: MatchNewsSnapshot[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollLeft = listRef.current.scrollWidth;
    }
  }, [news.length]);

  if (news.length === 0) return null;

  const items = [...news].reverse().slice(0, 15);

  return (
    <div className="sticky bottom-0 z-30 w-full border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500">News</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" ref={listRef} style={{ scrollbarWidth: "none" }}>
          {items.map((item) => {
            const style = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.good_news;
            return (
              <div
                className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs ${style.bg} ${style.border}`}
                key={item.id}
              >
                <span className={`font-semibold ${style.text}`}>{style.label}</span>
                <span className="max-w-[200px] truncate text-zinc-300">{item.headline}</span>
                {item.detail ? <span className="max-w-[120px] truncate text-zinc-500">· {item.detail}</span> : null}
                <span className="text-zinc-600">{formatTime(item.created_at)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
