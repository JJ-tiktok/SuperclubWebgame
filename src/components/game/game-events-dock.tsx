"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { LobbyClub, MatchNewsSnapshot } from "@/lib/lobby/types";
import {
  countUnreadOwnNews,
  formatNewsDate,
  formatNewsTime,
  getCategoryStyle,
  getLastSeenAt,
  parseGameChangerHeadline,
  resolveClubName,
} from "@/lib/game/game-changer-ui";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "own";

export function GameEventsDock({
  news,
  clubs,
  ownClubId,
  gameId,
}: {
  news: MatchNewsSnapshot[];
  clubs: LobbyClub[];
  ownClubId: string | undefined;
  gameId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const chipRef = useRef<HTMLDivElement>(null);
  const unreadCount = countUnreadOwnNews(news, ownClubId, gameId);

  const sorted = [...news].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const filtered =
    filter === "own" && ownClubId
      ? sorted.filter((item) => item.club_id === ownClubId)
      : sorted;

  const tickerItems = sorted.slice(0, 3);

  useEffect(() => {
    if (chipRef.current) {
      chipRef.current.scrollLeft = chipRef.current.scrollWidth;
    }
  }, [tickerItems.length]);

  if (news.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-30 w-full border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      {expanded ? (
        <div className="max-h-[40vh] overflow-y-auto border-b border-zinc-800">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Spielereignisse</span>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-[var(--club-color)] px-2 py-0.5 text-xs font-medium text-white">
                  +{unreadCount} neu
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {(["all", "own"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition",
                    filter === tab
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300",
                  )}
                >
                  {tab === "all" ? "Alle" : "Mein Verein"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="ml-1 rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="News einklappen"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
          <ul className="divide-y divide-zinc-800/80 px-3 py-1">
            {filtered.length === 0 ? (
              <li className="py-4 text-center text-sm text-zinc-500">Keine Ereignisse fuer diesen Filter.</li>
            ) : (
              filtered.map((item) => {
                const isOwn = item.club_id === ownClubId;
                const style = getCategoryStyle(item.category);
                const clubName = resolveClubName(clubs, item.club_id);
                const lastSeen = getLastSeenAt(gameId);
                const isUnread = isOwn && item.created_at > lastSeen;

                return (
                  <li
                    key={item.id}
                    className={cn(
                      "py-3",
                      isOwn && "rounded-md border-l-2 border-[var(--club-color)] pl-3 -ml-0.5",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-xs font-semibold",
                          style.chipBg,
                          style.chipBorder,
                          style.chipText,
                        )}
                      >
                        {style.label}
                      </span>
                      {clubName ? (
                        <span className="text-xs font-medium text-zinc-300">{clubName}</span>
                      ) : null}
                      {isOwn ? (
                        <span className="text-xs font-medium text-[var(--club-color)]">Dein Verein</span>
                      ) : null}
                      {isUnread ? (
                        <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-xs text-amber-200">Neu</span>
                      ) : null}
                      <span className="ml-auto text-xs text-zinc-600">{formatNewsDate(item.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-zinc-100">
                      {parseGameChangerHeadline(item.headline)}
                    </p>
                    {item.detail ? (
                      <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{item.detail}</p>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
        >
          News
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {unreadCount > 0 && !expanded ? (
          <span className="shrink-0 rounded-full bg-[var(--club-color)] px-2 py-0.5 text-xs font-medium text-white">
            +{unreadCount}
          </span>
        ) : null}
        {!expanded ? (
          <div
            className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
            ref={chipRef}
            style={{ scrollbarWidth: "none" }}
          >
            {tickerItems.map((item) => {
              const isOwn = item.club_id === ownClubId;
              const style = getCategoryStyle(item.category);
              const clubName = resolveClubName(clubs, item.club_id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setExpanded(true)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-left text-xs transition hover:brightness-110",
                    style.chipBg,
                    style.chipBorder,
                    isOwn && "ring-1 ring-[var(--club-color)]",
                  )}
                >
                  <span className={`font-semibold ${style.chipText}`}>{style.label}</span>
                  {clubName ? (
                    <span className="max-w-[80px] truncate text-zinc-400">{clubName}</span>
                  ) : null}
                  <span className="max-w-[180px] truncate text-zinc-300">
                    {parseGameChangerHeadline(item.headline)}
                  </span>
                  <span className="text-zinc-600">{formatNewsTime(item.created_at)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-zinc-500">{filtered.length} Ereignis{filtered.length === 1 ? "" : "se"}</span>
        )}
      </div>
    </div>
  );
}
