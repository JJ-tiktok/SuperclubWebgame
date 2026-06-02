"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import type { ClubPendingEffectSnapshot } from "@/lib/lobby/types";
import { describePendingEffect } from "@/lib/game/game-changer-ui";

export function ActiveEffectsChip({
  effects,
  roomCode,
}: {
  effects: ClubPendingEffectSnapshot[];
  roomCode: string;
}) {
  if (effects.length === 0) return null;

  const first = effects[0];
  const summary =
    effects.length === 1
      ? describePendingEffect(first)
      : `${describePendingEffect(first)} (+${effects.length - 1})`;

  return (
    <Link
      href={`/games/${roomCode}?view=grounds#game-changer`}
      className="inline-flex max-w-xs items-center gap-1.5 rounded-full border border-amber-700/50 bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-200 transition hover:border-amber-600 hover:bg-amber-950/80"
      title="Zu aktiven Karteneffekten"
    >
      <Zap size={14} className="shrink-0" aria-hidden />
      <span className="truncate">{effects.length} aktive{effects.length === 1 ? "r" : ""} Effekt{effects.length === 1 ? "" : "e"}</span>
      <span className="hidden truncate text-amber-300/80 sm:inline">· {summary}</span>
    </Link>
  );
}
