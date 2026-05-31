"use client";

import type { ClubPendingEffectSnapshot } from "@/lib/lobby/types";

type Props = {
  effects: ClubPendingEffectSnapshot[];
  className?: string;
};

const SCOPE_LABELS: Record<ClubPendingEffectSnapshot["scope"], string> = {
  next_match: "Naechstes Spiel",
  next_transfer: "Naechster Transfer",
  current_offseason: "Diese Offseason",
  next_offseason: "Naechste Offseason",
  this_season: "Diese Saison",
};

function describeEffectShort(effect: ClubPendingEffectSnapshot): string {
  const p = effect.payload as Record<string, unknown>;
  switch (effect.effect_type) {
    case "next_match_zone_delta": {
      const delta = Number(p.delta ?? 0);
      const zone = (p.zone as string | null) ?? "(Auswahl)";
      return `Zone ${zone}: ${delta >= 0 ? "+" : ""}${delta}`;
    }
    case "next_match_staff_disabled":
      return "Staff-Boni deaktiviert";
    case "next_match_draw_dice_bonus":
      return `+${Number(p.bonus ?? 0)} Wuerfel bei Unentschieden`;
    case "next_match_lineup_locked":
      return "Aufstellung gesperrt";
    case "training_capacity_delta": {
      const delta = p.delta;
      if (delta === "double") return "Trainingseinheiten verdoppelt";
      return `${Number(delta ?? 0) >= 0 ? "+" : ""}${delta} Trainingseinheit(en)`;
    }
    case "free_scouting_draw":
      return `${Number(p.count ?? 0)} gratis Scout-Draw(s)`;
    case "free_scouting_buy_next":
      return "Naechster Kauf gratis";
    case "free_staff_offer":
      return "Gratis Staff-Offerte";
    case "free_staff_signing":
      return "Gratis Staff-Verpflichtung";
    case "next_transfer_price_delta": {
      const amount = Number(p.amount ?? 0);
      return amount >= 0
        ? `Naechster Transfer +${Math.round(amount / 1_000_000)}M`
        : `Naechster Transfer ${Math.round(amount / 1_000_000)}M`;
    }
    case "offseason_lock":
      return `Gesperrt: ${(p.blocks as string[] | undefined)?.join(", ") ?? ""}`;
    default:
      return effect.effect_type;
  }
}

export function ActiveCardEffectsPanel({ effects, className }: Props) {
  if (effects.length === 0) return null;

  return (
    <div className={`rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-200">Aktive Karteneffekte</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {effects.map((effect) => (
          <li key={effect.id} className="flex items-center justify-between gap-3 text-zinc-200">
            <span>{describeEffectShort(effect)}</span>
            <span className="text-xs text-zinc-500">{SCOPE_LABELS[effect.scope] ?? effect.scope}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
