"use client";

import { useMemo, useState } from "react";
import { playMatchCardAction } from "@/app/games/actions/match";
import { Button } from "@/components/ui/button";
import { getCategoryStyle } from "@/lib/game/game-changer-ui";
import type { MatchCardChoiceKind } from "@/lib/game/game-changer-effects";
import type { ClubGameChangerSnapshot, ClubPlayerSnapshot } from "@/lib/lobby/types";

type Props = {
  gameId: string;
  roomCode: string;
  fixtureId: string;
  playWindow: "before_match" | "during_match" | "after_match";
  card: ClubGameChangerSnapshot;
  choiceKind: MatchCardChoiceKind;
  squad: ClubPlayerSnapshot[];
};

/**
 * Trigger button + overlay for v4 match cards that require a target selection
 * (zone / captain zone / own defender / own injured player).
 */
export function MatchCardChoiceModal({ gameId, roomCode, fixtureId, playWindow, card, choiceKind, squad }: Props) {
  const [open, setOpen] = useState(false);
  const style = getCategoryStyle(card.card.category);

  const defenders = useMemo(
    () =>
      squad
        .filter((cp) => cp.current_zone === "DEF" && !cp.injured)
        .sort((a, b) => Number(b.current_stars) - Number(a.current_stars)),
    [squad],
  );
  const injured = useMemo(
    () => squad.filter((cp) => cp.injured).sort((a, b) => Number(b.current_stars) - Number(a.current_stars)),
    [squad],
  );
  const fullSquad = useMemo(
    () => squad.slice().sort((a, b) => Number(b.current_stars) - Number(a.current_stars)),
    [squad],
  );

  const hidden = (
    <>
      <input type="hidden" name="game_id" value={gameId} />
      <input type="hidden" name="room_code" value={roomCode} />
      <input type="hidden" name="fixture_id" value={fixtureId} />
      <input type="hidden" name="club_game_changer_id" value={card.id} />
      <input type="hidden" name="play_window" value={playWindow} />
    </>
  );

  const playerTitle =
    choiceKind === "defender"
      ? "Verteidiger waehlen"
      : choiceKind === "captain_player"
        ? "Neuen Captain waehlen"
        : "Verletzten Spieler waehlen";
  const playerPool =
    choiceKind === "defender" ? defenders : choiceKind === "captain_player" ? fullSquad : injured;

  return (
    <>
      <Button
        className="w-full border-violet-700 text-violet-100 hover:bg-violet-950"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        {card.card.display_name}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className={`relative z-10 w-full max-w-md rounded-lg border-2 p-6 shadow-2xl ${style.bg} ${style.border}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${style.accent}`}>Geheimwaffe · Auswahl noetig</p>
            <h2 className="mt-1 text-lg font-bold text-zinc-50">{card.card.display_name}</h2>
            <p className="mt-2 text-sm text-zinc-300">{card.card.description}</p>

            {choiceKind === "zone" ? (
              <form action={playMatchCardAction} className="mt-4">
                {hidden}
                <p className="mb-2 text-xs font-medium text-zinc-400">Zone waehlen</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["DEF", "MID", "ATT"] as const).map((zone) => (
                    <Button key={zone} type="submit" name="choice_payload" value={JSON.stringify({ zone })} variant="secondary">
                      {zone}
                    </Button>
                  ))}
                </div>
              </form>
            ) : (
              <form action={playMatchCardAction} className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {hidden}
                <p className="text-xs font-medium text-zinc-400">{playerTitle}</p>
                {playerPool.length === 0 ? (
                  <p className="text-sm text-zinc-400">Kein passender Spieler verfuegbar.</p>
                ) : null}
                {playerPool.map((cp) => (
                  <button
                    key={cp.id}
                    type="submit"
                    name="choice_payload"
                    value={JSON.stringify({ club_player_id: cp.id })}
                    className="flex w-full items-center justify-between rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-100 hover:border-violet-500 hover:bg-zinc-800"
                  >
                    <span className="font-medium">{cp.player?.display_name ?? "Spieler"}</span>
                    <span className="text-xs text-zinc-400">
                      {cp.current_zone} · {Number(cp.current_stars)} Sterne
                    </span>
                  </button>
                ))}
              </form>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
