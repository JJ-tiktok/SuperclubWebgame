"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PrestigeEarningGuide } from "@/components/game/prestige-earning-guide";
import { PhilosophySelectionPanel } from "@/components/lobby/philosophy-selection-panel";
import { isPrestigeEnabled } from "@/lib/lobby/prestige";
import type { ActionResult, LobbyClub, LobbySnapshot } from "@/lib/lobby/types";

export function LobbySetupView({
  ownClub,
  snapshot,
}: {
  ownClub?: LobbyClub;
  snapshot: LobbySnapshot;
}) {
  const [status, setStatus] = useState<ActionResult | null>(null);
  const readyCount = snapshot.clubs.filter((club) => club.is_ready).length;
  const philosophyCount = snapshot.clubs.filter((club) => club.philosophy_id).length;
  const prestigeEnabled = isPrestigeEnabled(snapshot.game.settings);

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Lobby — Vorbereitung</PanelTitle>
            <PanelDescription>
              Waehle deine Vereinsphilosophie, markiere dich als fertig. Der Host startet den Draft, sobald alle
              Manager bereit sind und eine Philosophie gewaehlt haben.
            </PanelDescription>
          </div>
          <Users size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="flex flex-wrap gap-2">
          <Badge tone={readyCount === snapshot.clubs.length ? "green" : "neutral"}>
            {readyCount}/{snapshot.clubs.length} bereit
          </Badge>
          <Badge tone={philosophyCount === snapshot.clubs.length ? "green" : "neutral"}>
            {philosophyCount}/{snapshot.clubs.length} Philosophien
          </Badge>
        </div>
      </Panel>

      {status && !status.ok ? (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">{status.error}</div>
      ) : null}
      {status?.ok ? (
        <div className="rounded-md border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          Philosophie gespeichert.
        </div>
      ) : null}

      <PhilosophySelectionPanel
        clubs={snapshot.clubs}
        gameId={snapshot.game.id}
        onStatus={setStatus}
        ownClub={ownClub}
      />

      {prestigeEnabled ? <PrestigeEarningGuide compact /> : null}
    </div>
  );
}
