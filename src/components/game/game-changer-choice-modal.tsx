"use client";

import { useMemo } from "react";
import { resolveGameChangerChoiceAction } from "@/app/games/actions/game-changers";
import { Button } from "@/components/ui/button";
import type { ClubGameChangerSnapshot, ClubPlayerSnapshot } from "@/lib/lobby/types";

type ChoicePayload = {
  type?: string;
  effect_type?: string;
  stars?: number;
  delta?: number;
  filter?: string;
};

type Props = {
  gameId: string;
  roomCode: string;
  choice: ClubGameChangerSnapshot;
  squad: ClubPlayerSnapshot[];
};

export function GameChangerChoiceModal({ gameId, roomCode, choice, squad }: Props) {
  const payload = (choice.choice_payload ?? {}) as ChoicePayload;

  const sortedSquad = useMemo(
    () =>
      squad
        .slice()
        .sort((a, b) => Number(b.current_stars) - Number(a.current_stars)),
    [squad],
  );

  const headerBg = choice.card.category === "good_news" ? "bg-emerald-950 border-emerald-700" : "bg-rose-950 border-rose-700";
  const accent = choice.card.category === "good_news" ? "text-emerald-200" : "text-rose-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      <div className={`relative z-10 w-full max-w-md rounded-lg border-2 p-6 shadow-2xl ${headerBg}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>Auswahl noetig</p>
        <h2 className="mt-1 text-lg font-bold text-zinc-50">{choice.card.display_name}</h2>
        <p className="mt-2 text-sm text-zinc-300">{choice.card.description}</p>

        {payload.type === "pick_player" ? (
          <form action={resolveGameChangerChoiceAction} className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="room_code" value={roomCode} />
            <input type="hidden" name="club_game_changer_id" value={choice.id} />
            <input type="hidden" name="choice_type" value="pick_player" />
            {sortedSquad.length === 0 ? (
              <p className="text-sm text-zinc-400">Kein Spieler verfuegbar.</p>
            ) : null}
            {sortedSquad.map((cp) => (
              <button
                key={cp.id}
                type="submit"
                name="club_player_id"
                value={cp.id}
                className="flex w-full items-center justify-between rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-100 hover:border-amber-500 hover:bg-zinc-800"
              >
                <span className="font-medium">{cp.player?.display_name ?? "Spieler"}</span>
                <span className="text-xs text-zinc-400">
                  {cp.player?.position ?? ""} {Number(cp.current_stars)} Sterne
                </span>
              </button>
            ))}
          </form>
        ) : payload.type === "pick_zone" ? (
          <form action={resolveGameChangerChoiceAction} className="mt-4 grid grid-cols-3 gap-2">
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="room_code" value={roomCode} />
            <input type="hidden" name="club_game_changer_id" value={choice.id} />
            <input type="hidden" name="choice_type" value="pick_zone" />
            {(["DEF", "MID", "ATT"] as const).map((zone) => (
              <Button key={zone} type="submit" name="zone" value={zone} variant="secondary">
                {zone} {(payload.delta ?? 0) >= 0 ? "+" : ""}{payload.delta ?? 0}
              </Button>
            ))}
          </form>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">Unbekannter Auswahltyp.</p>
        )}
      </div>
    </div>
  );
}
