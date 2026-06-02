"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bandage, Skull, Sparkles, Swords } from "lucide-react";
import type { ClubPendingEffectSnapshot, LobbyClub, MatchNewsSnapshot } from "@/lib/lobby/types";
import { Button } from "@/components/ui/button";
import {
  describePendingEffect,
  findPendingEffectForNews,
  formatNewsDate,
  getCategoryStyle,
  getLastSeenAt,
  isNewsShownInSession,
  markNewsIdsShown,
  parseGameChangerHeadline,
  resolveClubName,
  setLastSeenAt,
} from "@/lib/game/game-changer-ui";

const CATEGORY_ICONS = {
  good_news: Sparkles,
  bad_news: Skull,
  secret_weapon: Swords,
  injury: Bandage,
} as const;

export function GameChangerPopup({
  news,
  ownClubId,
  gameId,
  roomCode,
  clubs,
  pendingEffects,
}: {
  news: MatchNewsSnapshot[];
  ownClubId: string | undefined;
  gameId: string;
  roomCode: string;
  clubs: LobbyClub[];
  pendingEffects: ClubPendingEffectSnapshot[];
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<MatchNewsSnapshot[]>([]);
  const queuedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ownClubId) return;

    const lastSeenAt = getLastSeenAt(gameId);

    const newItems = news.filter(
      (item) =>
        item.club_id === ownClubId &&
        item.created_at > lastSeenAt &&
        !isNewsShownInSession(gameId, item.id) &&
        !queuedIds.current.has(item.id),
    );

    if (newItems.length > 0) {
      markNewsIdsShown(
        gameId,
        newItems.map((item) => item.id),
      );
      newItems.forEach((item) => queuedIds.current.add(item.id));
      setQueue((prev) => [...prev, ...newItems].slice(0, 10));
    }
  }, [news, ownClubId, gameId]);

  const current = queue[0];
  const queueIndex = queue.length > 0 ? 1 : 0;
  const queueTotal = queue.length;

  const dismiss = useCallback(() => {
    setQueue((prev) => {
      const item = prev[0];
      if (item) {
        markNewsIdsShown(gameId, [item.id]);
        const seen = getLastSeenAt(gameId);
        if (!seen || item.created_at > seen) {
          setLastSeenAt(gameId, item.created_at);
        }
      }
      return prev.slice(1);
    });
  }, [gameId]);

  useEffect(() => {
    if (!current) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Enter") {
        dismiss();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, dismiss]);

  function goToActiveEffects() {
    dismiss();
    router.push(`/games/${roomCode}?view=grounds#game-changer`);
  }

  if (!current) return null;

  const style = getCategoryStyle(current.category);
  const Icon = CATEGORY_ICONS[current.category as keyof typeof CATEGORY_ICONS] ?? Sparkles;
  const clubName = resolveClubName(clubs, current.club_id);
  const cardTitle = parseGameChangerHeadline(current.headline);
  const linkedEffect = findPendingEffectForNews(current, pendingEffects);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={dismiss} aria-hidden />
      <div
        className={`relative z-10 w-full max-w-md rounded-lg border-2 p-6 shadow-2xl ${style.bg} ${style.border}`}
        role="dialog"
        aria-labelledby="gc-modal-title"
        aria-describedby="gc-modal-detail"
      >
        {queueTotal > 1 ? (
          <p className="mb-3 text-center text-xs font-medium text-zinc-400">
            Ereignis {queueIndex} von {queueTotal}
          </p>
        ) : null}

        <div className="flex items-start gap-3">
          <div className={`rounded-lg border p-2 ${style.border} bg-black/20`}>
            <Icon className={`h-7 w-7 ${style.accent}`} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold uppercase tracking-wide ${style.accent}`}>{style.label}</p>
            {clubName ? (
              <p className="mt-0.5 text-xs text-zinc-400">{clubName}</p>
            ) : null}
            <p id="gc-modal-title" className="mt-1 text-lg font-bold text-zinc-50">
              {cardTitle}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">{formatNewsDate(current.created_at)}</p>
          </div>
        </div>

        {current.detail ? (
          <p id="gc-modal-detail" className="mt-4 text-sm leading-relaxed text-zinc-300">
            {current.detail}
          </p>
        ) : null}

        {linkedEffect ? (
          <div className="mt-4 rounded-md border border-amber-700/50 bg-amber-950/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Aktiver Effekt</p>
            <p className="mt-1 text-sm text-zinc-200">{describePendingEffect(linkedEffect)}</p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button className="w-full" onClick={dismiss} variant="secondary">
            Verstanden
          </Button>
          {linkedEffect ? (
            <Button className="w-full" onClick={goToActiveEffects} variant="outline">
              Zu aktiven Effekten
            </Button>
          ) : null}
        </div>

        {queueTotal > 1 ? (
          <p className="mt-2 text-center text-xs text-zinc-500">
            Noch {queueTotal - 1} weitere Ereignis{queueTotal - 1 === 1 ? "" : "se"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
