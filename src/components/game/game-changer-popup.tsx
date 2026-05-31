"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchNewsSnapshot } from "@/lib/lobby/types";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "gc_popup_last_seen_at";

const CATEGORY_STYLES: Record<string, { bg: string; border: string; accent: string; icon: string; label: string }> = {
  good_news: { bg: "bg-green-950", border: "border-green-600", accent: "text-green-300", icon: "✅", label: "Good News" },
  bad_news: { bg: "bg-rose-950", border: "border-rose-600", accent: "text-rose-300", icon: "💥", label: "Bad News" },
  secret_weapon: { bg: "bg-violet-950", border: "border-violet-600", accent: "text-violet-300", icon: "⚔️", label: "Geheimwaffe" },
  injury: { bg: "bg-amber-950", border: "border-amber-600", accent: "text-amber-300", icon: "🚑", label: "Verletzung" },
};

export function GameChangerPopup({
  news,
  ownClubId,
}: {
  news: MatchNewsSnapshot[];
  ownClubId: string | undefined;
}) {
  // Single queue: the first item is the one currently displayed, dismissals shift the queue.
  const [queue, setQueue] = useState<MatchNewsSnapshot[]>([]);
  // Tracks IDs already queued or shown so Realtime re-renders don't re-add them.
  const shownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ownClubId) return;

    // Use a timestamp guard so items dismissed before a page reload don't reappear
    const lastSeenAt = localStorage.getItem(STORAGE_KEY) ?? "";

    const newItems = news.filter(
      (item) =>
        item.club_id === ownClubId &&
        item.created_at > lastSeenAt &&
        !shownIds.current.has(item.id),
    );

    if (newItems.length > 0) {
      newItems.forEach((item) => shownIds.current.add(item.id));
      // Append — never replace — so in-progress items are not discarded
      setQueue((prev) => [...prev, ...newItems].slice(0, 10));
    }
  }, [news, ownClubId]);

  const current = queue[0];

  function dismiss() {
    if (current) {
      // Store the timestamp so items up to this point are suppressed on reload
      localStorage.setItem(STORAGE_KEY, current.created_at);
    }
    setQueue((prev) => prev.slice(1));
  }

  if (!current) return null;

  const style = CATEGORY_STYLES[current.category] ?? CATEGORY_STYLES.good_news;
  const remaining = queue.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={dismiss} />
      <div className={`relative z-10 w-full max-w-sm rounded-lg border-2 p-6 shadow-2xl ${style.bg} ${style.border}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{style.icon}</span>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${style.accent}`}>{style.label}</p>
            <p className="mt-0.5 text-lg font-bold text-zinc-50">{current.headline}</p>
          </div>
        </div>
        {current.detail ? (
          <p className="mt-3 text-sm text-zinc-300">{current.detail}</p>
        ) : null}
        <Button className="mt-5 w-full" onClick={dismiss} variant="secondary">
          Verstanden
        </Button>
        {remaining > 0 ? (
          <p className="mt-2 text-center text-xs text-zinc-500">Noch {remaining} weitere Ereignisse</p>
        ) : null}
      </div>
    </div>
  );
}
