"use client";

import { Trophy } from "lucide-react";
import { advanceContinentalRoundAction } from "@/app/games/actions/continental";
import { formatMoney } from "@/components/game/lib/dashboard-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import {
  CONTINENTAL_PRIZE_FINALIST,
  CONTINENTAL_PRIZE_SEMIFINAL,
  CONTINENTAL_PRIZE_WINNER,
  getContinentalRoundLabel,
} from "@/lib/lobby/continental-cup";
import type { ContinentalParticipantSnapshot, ContinentalTournamentSnapshot, LobbyClub, LobbySnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";
import { computeParticipantRecord, getOwnStatusHeadline } from "./continental-bracket-utils";

export function ContinentalStatusBanner({
  continental,
  isHost,
  ownClub,
  ownParticipant,
  snapshot,
}: {
  continental: ContinentalTournamentSnapshot;
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  ownParticipant: ContinentalParticipantSnapshot | null;
  snapshot: LobbySnapshot;
}) {
  const currentRoundFixtures = continental.fixtures.filter((fixture) => fixture.round === continental.current_round);
  const completedCount = currentRoundFixtures.filter((fixture) => fixture.status === "completed").length;
  const currentRoundComplete =
    currentRoundFixtures.length > 0 && currentRoundFixtures.every((fixture) => fixture.status === "completed");
  const record = ownParticipant ? computeParticipantRecord(continental.fixtures, ownParticipant.id) : null;
  const isActive = ownParticipant?.eliminated_round == null && continental.status !== "completed";
  const headline = getOwnStatusHeadline(continental, ownParticipant);

  return (
    <Panel
      className={cn(
        "border-[var(--club-border)] bg-zinc-950/85",
        isActive && "shadow-[0_0_20px_rgba(16,185,129,0.12)]",
      )}
    >
      <PanelHeader>
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border",
              isActive ? "border-emerald-500/60 bg-emerald-500/10" : "border-zinc-700 bg-zinc-900/70",
            )}
          >
            <Trophy className={cn("h-8 w-8", isActive ? "text-emerald-400" : "text-zinc-400")} aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">Continental Cup</p>
            <PanelTitle className="mt-1">{headline}</PanelTitle>
            <PanelDescription className="mt-1">
              Saison {continental.season_number} — Praemien bis {formatMoney(continental.prize_amount)} (HF{" "}
              {formatMoney(CONTINENTAL_PRIZE_SEMIFINAL)} / Finale {formatMoney(CONTINENTAL_PRIZE_FINALIST)} / Sieg{" "}
              {formatMoney(CONTINENTAL_PRIZE_WINNER)})
            </PanelDescription>
          </div>
        </div>
        <Badge tone={continental.status === "completed" ? "green" : "blue"}>
          {continental.status === "completed"
            ? "Abgeschlossen"
            : `${completedCount}/${currentRoundFixtures.length} in ${getContinentalRoundLabel(continental.current_round)}`}
        </Badge>
      </PanelHeader>

      {record ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Siege", value: record.wins, tone: "text-emerald-400" },
            { label: "Unentschieden", value: record.draws, tone: "text-zinc-200" },
            { label: "Niederlagen", value: record.losses, tone: "text-rose-300" },
          ].map((item) => (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-center" key={item.label}>
              <p className="text-xs font-medium uppercase text-zinc-500">{item.label}</p>
              <p className={cn("mt-2 text-2xl font-bold", item.tone)}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {ownParticipant ? (
        <p className="mt-3 text-sm text-zinc-300">
          Dein Team:{" "}
          <span className="font-semibold text-zinc-50" title={ownParticipant.display_name}>
            {ownParticipant.display_name}
          </span>
        </p>
      ) : null}

      {isHost && continental.status !== "completed" && currentRoundComplete ? (
        <form action={advanceContinentalRoundAction} className="mt-4">
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <Button type="submit" variant="primary">
            Naechste Runde starten
          </Button>
        </form>
      ) : null}

      {continental.status === "completed" ? (
        <p className="mt-3 text-sm text-emerald-300">
          Turnier beendet.
          {isHost ? " Nutze oben „Fortsetzen“, um in die Off-Season zu wechseln." : " Der Host kann oben „Fortsetzen“ waehlen."}
        </p>
      ) : null}
    </Panel>
  );
}
