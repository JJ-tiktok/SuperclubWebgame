"use client";

import { Star } from "lucide-react";
import { setCaptainAction } from "@/app/games/actions/match";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";

export function CaptainPanel({
  boostExtra = 0,
  gameId,
  roomCode,
  squad,
  captainClubPlayerId,
  boostRank,
}: {
  boostExtra?: number;
  gameId: string;
  roomCode: string;
  squad: ClubPlayerSnapshot[];
  captainClubPlayerId: string | null | undefined;
  boostRank: number | null | undefined;
}) {
  const placementBoost = Math.trunc(Number(boostRank ?? 0));
  const staffBoost = Math.trunc(Number(boostExtra ?? 0));
  const boost = placementBoost + staffBoost;
  const hasBoost = boost > 0;
  const sorted = squad
    .slice()
    .sort((a, b) => Number(b.current_stars) - Number(a.current_stars));
  const captain = sorted.find((cp) => cp.id === captainClubPlayerId) ?? null;

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="captain">
      <PanelHeader>
        <div>
          <PanelTitle>Captain Boost</PanelTitle>
          <PanelDescription>
            {hasBoost
              ? staffBoost > 0 && placementBoost > 0
                ? `Dein Captain erhaelt +${boost} Sterne in seiner Zone (+${placementBoost} Platzierung, +${staffBoost} Mitarbeiter).`
                : staffBoost > 0
                  ? `Dein Captain erhaelt +${boost} Sterne in seiner Zone (Mitarbeiter-Bonus).`
                  : `Dein Captain erhaelt +${boost} Sterne in seiner Zone (Saison-Bonus aus Platzierung).`
              : "Noch kein Captain-Boost. Der Bonus wird nach Saisonende anhand der Platzierung vergeben."}
          </PanelDescription>
        </div>
        <Star size={18} className="text-amber-400" aria-hidden />
      </PanelHeader>

      <div className="space-y-3 p-1">
        <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
          <span className="text-zinc-400">Aktueller Captain</span>
          <span className="font-semibold text-zinc-100">
            {captain ? (
              <>
                {captain.player?.display_name ?? "Spieler"}
                {hasBoost ? <span className="ml-2 text-amber-400">+{boost}</span> : null}
              </>
            ) : (
              <span className="text-zinc-500">nicht gesetzt</span>
            )}
          </span>
        </div>

        <form action={setCaptainAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="game_id" value={gameId} />
          <input type="hidden" name="room_code" value={roomCode} />
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-zinc-400">Captain zuweisen</span>
            <select
              name="club_player_id"
              defaultValue={captainClubPlayerId ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
            >
              <option value="">Kein Captain</option>
              {sorted.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.player?.display_name ?? "Spieler"} ({cp.current_zone} · {Number(cp.current_stars)})
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Speichern
          </Button>
        </form>
        {hasBoost ? (
          <p className="text-xs text-zinc-500">
            Der Boost wirkt nur, wenn der Captain in der Aufstellung steht (nicht auf der Bank / verletzt).
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
