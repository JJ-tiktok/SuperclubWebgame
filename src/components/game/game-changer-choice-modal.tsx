"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resolveGameChangerChoiceAction } from "@/app/games/actions/game-changers";
import { Button } from "@/components/ui/button";
import { getCategoryStyle } from "@/lib/game/game-changer-ui";
import { getOffseasonCardCandidates } from "@/lib/game/game-changer-effects";
import { getClubPlayerDisplayName } from "@/lib/lobby/player-names";
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
  const offseasonCandidates = useMemo(
    () => (payload.type === "pick_offseason_card" ? getOffseasonCardCandidates(choice.choice_payload) : []),
    [choice.choice_payload, payload.type],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sortedSquad = useMemo(
    () =>
      squad
        .slice()
        .sort((a, b) => Number(b.current_stars) - Number(a.current_stars)),
    [squad],
  );

  const requiredStars = Math.max(1, Math.trunc(Number(payload.stars ?? 0)));
  const selectedStars = useMemo(
    () =>
      sortedSquad
        .filter((player) => selectedIds.has(player.id))
        .reduce((total, player) => total + Math.trunc(Number(player.current_stars)), 0),
    [selectedIds, sortedSquad],
  );

  const style = getCategoryStyle(
    payload.type === "pick_offseason_card" && offseasonCandidates[0]
      ? offseasonCandidates[0].category
      : (choice.card?.category ?? "good_news"),
  );

  function togglePlayer(playerId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      <div className={`relative z-10 w-full max-w-md rounded-lg border-2 p-6 shadow-2xl ${style.bg} ${style.border}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${style.accent}`}>{style.label} · Auswahl noetig</p>
        <h2 className="mt-1 text-lg font-bold text-zinc-50">
          {payload.type === "pick_offseason_card" ? "Comeback-Bonus: Neue Impulse" : choice.card.display_name}
        </h2>
        <p className="mt-2 text-sm text-zinc-300">
          {payload.type === "pick_offseason_card"
            ? "Waehle eine von zwei Game-Changer-Karten (positive Ereignisse & Geheimwaffen)."
            : choice.card.description}
        </p>

        {payload.type === "pick_offseason_card" ? (
          offseasonCandidates.length === 0 ? (
            <p className="mt-4 text-sm text-rose-300">
              Die Karten-Auswahl konnte nicht geladen werden. Bitte die Seite neu laden.
            </p>
          ) : (
          <form action={resolveGameChangerChoiceAction} className="mt-4 space-y-2">
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="room_code" value={roomCode} />
            <input type="hidden" name="club_game_changer_id" value={choice.id} />
            <input type="hidden" name="choice_type" value="pick_offseason_card" />
            {offseasonCandidates.map((candidate) => {
              const candidateStyle = getCategoryStyle(candidate.category);
              return (
                <button
                  key={candidate.card_id}
                  type="submit"
                  name="card_id"
                  value={candidate.card_id}
                  className={`flex w-full flex-col rounded border px-3 py-3 text-left transition hover:brightness-110 ${candidateStyle.bg} ${candidateStyle.border}`}
                >
                  <span className={`text-[11px] font-semibold uppercase ${candidateStyle.accent}`}>{candidateStyle.label}</span>
                  <span className="mt-1 text-sm font-semibold text-zinc-50">{candidate.display_name}</span>
                  <span className="mt-1 text-xs text-zinc-300">{candidate.description}</span>
                </button>
              );
            })}
          </form>
          )
        ) : payload.type === "pick_player" ? (
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
                <span className="font-medium">{getClubPlayerDisplayName(cp)}</span>
                <span className="text-xs text-zinc-400">
                  {cp.player?.position ?? ""} {Number(cp.current_stars)} Sterne
                </span>
              </button>
            ))}
          </form>
        ) : payload.type === "pick_release_players" ? (
          <form action={resolveGameChangerChoiceAction} className="mt-4">
            <input type="hidden" name="game_id" value={gameId} />
            <input type="hidden" name="room_code" value={roomCode} />
            <input type="hidden" name="club_game_changer_id" value={choice.id} />
            <input type="hidden" name="choice_type" value="pick_release_players" />

            <p className="mb-3 text-sm text-zinc-300">
              Waehle Spieler zum Entlassen. Mindestens{" "}
              <span className="font-semibold text-zinc-100">{requiredStars} Sterne</span> gesamt.
            </p>

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {sortedSquad.length === 0 ? (
                <p className="text-sm text-zinc-400">Kein Spieler verfuegbar.</p>
              ) : (
                sortedSquad.map((cp) => {
                  const checked = selectedIds.has(cp.id);
                  return (
                    <label
                      className={`flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-sm transition ${
                        checked
                          ? "border-amber-500 bg-zinc-800 text-zinc-50"
                          : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500"
                      }`}
                      key={cp.id}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <input
                          checked={checked}
                          className="h-4 w-4 shrink-0 accent-amber-500"
                          name="club_player_id"
                          onChange={() => togglePlayer(cp.id)}
                          type="checkbox"
                          value={cp.id}
                        />
                        <span className="truncate font-medium">{getClubPlayerDisplayName(cp)}</span>
                      </span>
                      <span className="shrink-0 pl-3 text-xs text-zinc-400">
                        {cp.player?.position ?? ""} {Number(cp.current_stars)} Sterne
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">
                Ausgewaehlt:{" "}
                <span className={selectedStars >= requiredStars ? "font-semibold text-emerald-400" : "font-semibold text-zinc-200"}>
                  {selectedStars}
                </span>{" "}
                / {requiredStars} Sterne
              </p>
              <Button disabled={selectedStars < requiredStars || selectedIds.size === 0} type="submit">
                Entlassen
              </Button>
            </div>
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
