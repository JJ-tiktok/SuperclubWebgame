"use client";

import { Trophy } from "lucide-react";
import { initializeContinentalCupAction } from "@/app/games/actions/continental";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { LobbyClub, LobbySnapshot } from "@/lib/lobby/types";
import { ViewGuidePanel } from "@/components/game/shared/view-guide-panel";
import { ContinentalBracket } from "./continental-bracket";
import { ContinentalManagersStatus } from "./continental-managers-status";
import { ContinentalMatchHero } from "./continental-match-hero";
import { ContinentalStatusBanner } from "./continental-status-banner";

export function ContinentalView({
  isHost,
  ownClub,
  snapshot,
}: {
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const continental = snapshot.continental;

  if (!continental) {
    return (
      <div className="space-y-4">
        <ViewGuidePanel roomCode={snapshot.game.room_code} view="continental" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Continental Cup</PanelTitle>
            <PanelDescription>
              Der Continental Cup startet nach geraden Saisons zwischen Saisonabschluss und Off-Season.
            </PanelDescription>
          </div>
          <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
      </div>
    );
  }

  if (continental.setup_error) {
    return (
      <div className="space-y-4">
        <ViewGuidePanel roomCode={snapshot.game.room_code} view="continental" />
      <Panel className="border-amber-700 bg-amber-950/30">
        <PanelHeader>
          <div>
            <PanelTitle>Continental Cup Setup</PanelTitle>
            <PanelDescription>{continental.setup_error}</PanelDescription>
          </div>
          <Trophy size={18} className="text-amber-200" aria-hidden />
        </PanelHeader>
        {isHost ? (
          <form action={initializeContinentalCupAction}>
            <input name="game_id" type="hidden" value={snapshot.game.id} />
            <input name="room_code" type="hidden" value={snapshot.game.room_code} />
            <Button type="submit" variant="primary">
              Turnier initialisieren
            </Button>
          </form>
        ) : null}
      </Panel>
      </div>
    );
  }

  const ownParticipant = ownClub
    ? (continental.participants.find((participant) => participant.club_id === ownClub.id) ?? null)
    : null;

  return (
    <div className="space-y-5">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="continental" />
      <ContinentalStatusBanner
        continental={continental}
        isHost={isHost}
        ownClub={ownClub}
        ownParticipant={ownParticipant}
        snapshot={snapshot}
      />

      <div id="match">
        <ContinentalMatchHero continental={continental} isHost={isHost} ownClub={ownClub} snapshot={snapshot} />
      </div>

      <ContinentalManagersStatus continental={continental} ownClub={ownClub} />

      <ContinentalBracket continental={continental} ownClub={ownClub} />
    </div>
  );
}
