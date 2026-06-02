"use client";

import { playMatchCardAction, playSecretWeaponAction } from "@/app/games/actions/match";
import { Button } from "@/components/ui/button";
import { describeGameChangerEffects, getMatchCardChoiceKind, parseEffects } from "@/lib/game/game-changer-effects";
import type { ClubGameChangerSnapshot, ClubPlayerSnapshot } from "@/lib/lobby/types";
import { MatchCardChoiceModal } from "./match-card-choice-modal";

export type MatchWindow = "before_match" | "during_match" | "after_match";

const WINDOW_LABEL: Record<MatchWindow, string> = {
  before_match: "Vor dem Anpfiff",
  during_match: "Waehrend des Spiels",
  after_match: "Nach dem Spiel",
};

/**
 * Returns the windows a card can be played in. v4 cards declare their window;
 * legacy secret weapons (no play_window) keep the old behaviour (before + during).
 */
function cardWindows(card: ClubGameChangerSnapshot): MatchWindow[] {
  const pw = card.card.play_window;
  if (pw === "before_match" || pw === "during_match" || pw === "after_match") {
    return [pw];
  }
  return ["before_match", "during_match"];
}

function isV4Card(card: ClubGameChangerSnapshot): boolean {
  return Boolean(card.card.play_window);
}

export function MatchCardsPanel({
  gameId,
  roomCode,
  fixtureId,
  window: currentWindow,
  cards,
  squad,
  playedWindows,
}: {
  gameId: string;
  roomCode: string;
  fixtureId: string;
  window: MatchWindow;
  cards: ClubGameChangerSnapshot[];
  squad: ClubPlayerSnapshot[];
  playedWindows: Set<string>;
}) {
  const playable = cards.filter((card) => cardWindows(card).includes(currentWindow));
  if (playable.length === 0) return null;

  const windowUsed = playedWindows.has(currentWindow);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-violet-300">Geheimwaffe · {WINDOW_LABEL[currentWindow]}</p>
      {windowUsed ? (
        <p className="rounded bg-violet-950/50 px-2 py-1.5 text-xs text-violet-400">
          In diesem Fenster wurde bereits eine Karte eingesetzt.
        </p>
      ) : (
        playable.map((card) => {
          const effects = parseEffects(card.card.effects);
          const choiceKind = getMatchCardChoiceKind(effects);
          const v4 = isV4Card(card);

          if (v4 && choiceKind) {
            return (
              <MatchCardChoiceModal
                key={card.id}
                gameId={gameId}
                roomCode={roomCode}
                fixtureId={fixtureId}
                playWindow={currentWindow}
                card={card}
                choiceKind={choiceKind}
                squad={squad}
              />
            );
          }

          const action = v4 ? playMatchCardAction : playSecretWeaponAction;
          return (
            <form action={action} key={card.id}>
              <input name="game_id" type="hidden" value={gameId} />
              <input name="room_code" type="hidden" value={roomCode} />
              <input name="fixture_id" type="hidden" value={fixtureId} />
              <input name="club_game_changer_id" type="hidden" value={card.id} />
              {v4 ? <input name="play_window" type="hidden" value={currentWindow} /> : null}
              <Button
                className="w-full border-violet-700 text-violet-100 hover:bg-violet-950"
                title={describeGameChangerEffects(effects)}
                type="submit"
                variant="outline"
              >
                {card.card.display_name}
              </Button>
            </form>
          );
        })
      )}
    </div>
  );
}

/**
 * After-match window: shows the retroactive-win dice result if it was already
 * played, otherwise offers "Sieg oder Spielabbruch" style cards to the loser.
 */
export function AfterMatchCards({
  gameId,
  roomCode,
  fixtureId,
  cards,
  squad,
  playedWindows,
  ownLost,
  retroWinResult,
}: {
  gameId: string;
  roomCode: string;
  fixtureId: string;
  cards: ClubGameChangerSnapshot[];
  squad: ClubPlayerSnapshot[];
  playedWindows: Set<string>;
  ownLost: boolean;
  retroWinResult: { rolls?: number[]; success?: boolean } | null;
}) {
  if (retroWinResult && Array.isArray(retroWinResult.rolls)) {
    return (
      <div
        className={`rounded-md border p-3 text-xs ${
          retroWinResult.success
            ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
            : "border-zinc-700 bg-zinc-900/50 text-zinc-400"
        }`}
      >
        <p className="font-semibold">Sieg oder Spielabbruch</p>
        <p className="mt-1">Wurf: {retroWinResult.rolls.join(", ")}</p>
        <p className="mt-0.5">
          {retroWinResult.success ? "Eine 6! Die Niederlage wurde in einen Sieg gedreht." : "Keine 6 – das Ergebnis bleibt bestehen."}
        </p>
      </div>
    );
  }

  if (!ownLost) return null;

  return (
    <MatchCardsPanel
      gameId={gameId}
      roomCode={roomCode}
      fixtureId={fixtureId}
      window="after_match"
      cards={cards}
      squad={squad}
      playedWindows={playedWindows}
    />
  );
}
