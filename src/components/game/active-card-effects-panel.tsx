"use client";

import type { ClubPendingEffectSnapshot } from "@/lib/lobby/types";
import { describePendingEffect, PENDING_SCOPE_LABELS } from "@/lib/game/game-changer-ui";

type Props = {
  effects: ClubPendingEffectSnapshot[];
  className?: string;
};

export function ActiveCardEffectsPanel({ effects, className }: Props) {
  if (effects.length === 0) return null;

  return (
    <div className={`rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-200">Aktive Karteneffekte</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {effects.map((effect) => (
          <li key={effect.id} className="flex items-center justify-between gap-3 text-zinc-200">
            <span>{describePendingEffect(effect)}</span>
            <span className="text-xs text-zinc-500">{PENDING_SCOPE_LABELS[effect.scope] ?? effect.scope}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
