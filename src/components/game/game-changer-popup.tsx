"use client";

import { useEffect, useState } from "react";
import type { MatchNewsSnapshot } from "@/lib/lobby/types";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "gc_popup_last_seen_id";

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
  const [pending, setPending] = useState<MatchNewsSnapshot[]>([]);
  const [current, setCurrent] = useState<MatchNewsSnapshot | null>(null);

  useEffect(() => {
    if (!ownClubId) return;

    const lastSeenId = localStorage.getItem(STORAGE_KEY);
    const lastSeenTime = lastSeenId
      ? news.find((n) => n.id === lastSeenId)?.created_at ?? null
      : null;

    const unseen = news.filter((item) => {
      if (item.club_id !== ownClubId) return false;
      if (!lastSeenTime) return true;
      return item.created_at > lastSeenTime;
    });

    if (unseen.length > 0) {
      setPending(unseen.slice(0, 5));
    }
  }, [news, ownClubId]);

  useEffect(() => {
    if (!current && pending.length > 0) {
      setCurrent(pending[0]);
      setPending((prev) => prev.slice(1));
    }
  }, [current, pending]);

  function dismiss() {
    if (current) {
      localStorage.setItem(STORAGE_KEY, current.id);
    }
    setCurrent(null);
  }

  if (!current) return null;

  const style = CATEGORY_STYLES[current.category] ?? CATEGORY_STYLES.good_news;

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
        {pending.length > 0 ? (
          <p className="mt-2 text-center text-xs text-zinc-500">Noch {pending.length} weitere Ereignisse</p>
        ) : null}
      </div>
    </div>
  );
}
