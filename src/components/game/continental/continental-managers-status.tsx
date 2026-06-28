"use client";

import { Lock, LockOpen, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ContinentalTournamentSnapshot, LobbyClub } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";
import { getManagerRoundStatus, sortManagersForDisplay } from "./continental-bracket-utils";

function LineupLockBadge({ locked, side }: { locked: boolean; side: "Heim" | "Auswärts" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        locked
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-zinc-700 bg-zinc-900/60 text-zinc-500",
      )}
    >
      {locked ? <Lock size={10} aria-hidden /> : <LockOpen size={10} aria-hidden />}
      {side} {locked ? "gelockt" : "offen"}
    </span>
  );
}

export function ContinentalManagersStatus({
  continental,
  ownClub,
}: {
  continental: ContinentalTournamentSnapshot;
  ownClub: LobbyClub | undefined;
}) {
  const humanManagers = continental.participants.filter((participant) => participant.kind === "human");
  if (humanManagers.length === 0) {
    return null;
  }

  const sorted = sortManagersForDisplay(humanManagers, ownClub?.id);

  return (
    <Panel className="border-zinc-800 bg-zinc-950/70">
      <PanelHeader>
        <div>
          <PanelTitle>Manager-Status</PanelTitle>
          <PanelDescription>Aktuelle Runde, Gegner und Lock-Status aller Manager im Turnier</PanelDescription>
        </div>
        <Users size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      <div className="space-y-2">
        {sorted.map((participant) => {
          const status = getManagerRoundStatus(participant, continental);
          const isOwn = participant.club_id === ownClub?.id;
          const fixture = status.currentFixture;

          return (
            <div
              className={cn(
                "rounded-md border p-3",
                isOwn ? "border-[var(--club-border)] bg-zinc-900/80" : "border-zinc-800 bg-zinc-900/40",
              )}
              key={participant.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className={cn("font-semibold", isOwn && "text-[var(--club-color)]")}
                    title={participant.display_name}
                  >
                    {participant.display_name}
                    {isOwn ? <span className="ml-2 text-xs font-normal text-zinc-500">(du)</span> : null}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">{status.statusLabel}</p>
                </div>
                <Badge tone={status.isActive ? "blue" : status.participant.eliminated_round == null ? "green" : "neutral"}>
                  {status.isActive ? "aktiv" : participant.eliminated_round == null ? "im Turnier" : "aus"}
                </Badge>
              </div>

              {fixture && status.opponentName ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                    <span>
                      vs{" "}
                      <span className="font-medium text-zinc-100" title={status.opponentName}>
                        {status.opponentName}
                      </span>
                    </span>
                    {fixture.status === "completed" ? (
                      <span className="font-semibold text-zinc-50">
                        {fixture.home_score ?? 0} : {fixture.away_score ?? 0}
                      </span>
                    ) : (
                      <span className="text-zinc-500">offen</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LineupLockBadge locked={status.homeLocked} side="Heim" />
                    <LineupLockBadge locked={status.awayLocked} side="Auswärts" />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
