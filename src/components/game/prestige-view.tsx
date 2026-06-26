"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Crown, Medal, Target, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PrestigeEarningGuide } from "@/components/game/prestige-earning-guide";
import { ViewGuidePanel } from "@/components/game/shared/view-guide-panel";
import { formatPrestigeAwardLabel } from "@/lib/lobby/prestige";
import type { LobbySnapshot, PrestigeAwardSnapshot, PrestigeSnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

function ClubAwardsList({ awards }: { awards: PrestigeAwardSnapshot[] }) {
  if (awards.length === 0) {
    return <p className="mt-3 text-xs text-zinc-500">Noch keine Prestige-Punkte vergeben.</p>;
  }

  return (
    <ul className="mt-3 space-y-1.5 border-t border-zinc-800/80 pt-3">
      {awards.map((award) => (
        <li
          key={award.id}
          className="flex items-center justify-between gap-2 rounded-md bg-zinc-900/50 px-2.5 py-1.5"
        >
          <div className="min-w-0">
            <p className="truncate text-xs text-zinc-300">{formatPrestigeAwardLabel(award.category, award.metadata)}</p>
            <p className="text-[11px] text-zinc-600">Saison {award.season_number}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-lime-300">+{award.points}</span>
        </li>
      ))}
    </ul>
  );
}

export function PrestigeView({
  prestige,
  ownClubId,
  roomCode,
  snapshot,
}: {
  prestige: PrestigeSnapshot | null;
  ownClubId?: string;
  roomCode: string;
  snapshot: LobbySnapshot;
}) {
  const [expandedClubId, setExpandedClubId] = useState<string | null>(ownClubId ?? null);

  if (!prestige?.enabled) {
    return (
      <Panel>
        <PanelTitle>Prestige</PanelTitle>
        <PanelDescription>Das Prestigesystem ist in diesem Spielstand deaktiviert.</PanelDescription>
      </Panel>
    );
  }

  const ownClub = prestige.clubs.find((club) => club.club_id === ownClubId);

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={roomCode} view="prestige" />

      {prestige.game_completed ? (
        <Panel className="border-amber-700/60 bg-amber-950/30">
          <PanelHeader>
            <div>
              <PanelTitle className="flex items-center gap-2 text-amber-100">
                <Crown size={18} aria-hidden />
                Spiel beendet
              </PanelTitle>
              <PanelDescription>
                {prestige.winner_club_name
                  ? `${prestige.winner_club_name} gewinnt mit dem hoechsten Prestige.`
                  : "Das Spiel ist abgeschlossen."}
              </PanelDescription>
            </div>
          </PanelHeader>
        </Panel>
      ) : null}

      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Prestige-Rennen</PanelTitle>
            <PanelDescription>
              Ziel: {prestige.target} Prestige oder 2. Continental-Cup-Sieg loest die finale Saison aus.
              {prestige.is_final_season ? " Aktuell laeuft die finale Saison." : ""}
              {" "}
              Klicke auf einen Club, um die vergebenen Punkte zu sehen.
            </PanelDescription>
          </div>
          <Target size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>

        <div className="space-y-3">
          {prestige.clubs.map((club, index) => {
            const progress = Math.min(100, Math.round((club.prestige_points / prestige.target) * 100));
            const isOwn = club.club_id === ownClubId;
            const isExpanded = expandedClubId === club.club_id;
            return (
              <div
                key={club.club_id}
                className={cn(
                  "rounded-lg border p-4",
                  isOwn ? "border-[var(--club-color)] bg-[var(--club-color)]/10" : "border-zinc-800 bg-zinc-900/50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-500">#{index + 1}</span>
                    <p className="font-medium text-zinc-100">{club.club_name}</p>
                    {isOwn ? <Badge tone="blue">du</Badge> : null}
                    {club.philosophy_fulfilled ? <Badge tone="green">Philosophie erfuellt</Badge> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">{club.prestige_points} Prestige</Badge>
                    {club.continental_wins > 0 ? (
                      <Badge tone="blue">
                        <Trophy size={12} aria-hidden />
                        {club.continental_wins}x CL
                      </Badge>
                    ) : null}
                    <Button
                      className="h-8 px-2"
                      onClick={() => setExpandedClubId(isExpanded ? null : club.club_id)}
                      type="button"
                      variant="ghost"
                    >
                      {isExpanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                      <span className="sr-only">{isExpanded ? "Punkte ausblenden" : "Punkte anzeigen"}</span>
                    </Button>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-[var(--club-color)]"
                    style={{ width: `${progress}%`, backgroundColor: club.club_color ?? undefined }}
                  />
                </div>
                {club.philosophy_label ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Philosophie: {club.philosophy_label}
                    {club.philosophy_progress
                      ? ` (${club.philosophy_progress.current}/${club.philosophy_progress.target} ${club.philosophy_progress.label})`
                      : ""}
                  </p>
                ) : null}
                {isExpanded ? <ClubAwardsList awards={club.awards} /> : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <PrestigeEarningGuide />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Deine Philosophie</PanelTitle>
              <PanelDescription>Einmaliges Langzeitziel mit Prestige-Bonus.</PanelDescription>
            </div>
            <Medal size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          {ownClub?.philosophy_label ? (
            <div className="space-y-2">
              <p className="font-medium text-zinc-100">{ownClub.philosophy_label}</p>
              {ownClub.philosophy_progress ? (
                <p className="text-sm text-zinc-400">
                  Fortschritt: {ownClub.philosophy_progress.current}/{ownClub.philosophy_progress.target}{" "}
                  {ownClub.philosophy_progress.label}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              {snapshot.game.phase === "lobby"
                ? "Waehle deine Philosophie in der Lobby-Ansicht, bevor der Draft startet."
                : "Keine Philosophie gewaehlt."}
            </p>
          )}
        </Panel>

        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Deine Prestige-Historie</PanelTitle>
              <PanelDescription>Alle vergebenen Prestige-Punkte deines Vereins.</PanelDescription>
            </div>
          </PanelHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {prestige.own_awards.length === 0 ? (
              <p className="text-sm text-zinc-500">Noch keine Prestige-Punkte gesammelt.</p>
            ) : (
              prestige.own_awards.map((award) => (
                <div
                  key={award.id}
                  className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-zinc-200">{formatPrestigeAwardLabel(award.category, award.metadata)}</p>
                    <p className="text-xs text-zinc-500">Saison {award.season_number}</p>
                  </div>
                  <Badge tone="green">+{award.points}</Badge>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {snapshot.game.phase === "completed" ? null : (
        <p className="text-xs text-zinc-600">
          Final-Saison {prestige.final_season_number ? `#${prestige.final_season_number}` : "noch nicht ausgeloest"}.
        </p>
      )}
    </div>
  );
}
