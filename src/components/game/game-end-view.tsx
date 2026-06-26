"use client";

import { ArrowLeft, Crown, Medal, Trophy } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { ClubBadge } from "@/components/game/club-badge";
import { resolvePrestigeWinner } from "@/lib/lobby/prestige";
import type { LobbyClub, LobbySnapshot, PrestigeSnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

function buildRanking(snapshot: LobbySnapshot, prestige: PrestigeSnapshot | null) {
  if (prestige?.clubs.length) {
    return prestige.clubs;
  }

  return [...snapshot.clubs]
    .map((club) => ({
      club_id: club.id,
      club_name: club.club_name,
      club_color: club.club_color,
      manager_name: club.manager_name,
      prestige_points: Number(club.prestige_points ?? 0),
      continental_wins: Number(club.continental_wins ?? 0),
      philosophy_label: null,
      philosophy_fulfilled: Boolean(club.philosophy_fulfilled),
      season_rank: club.season_rank ?? null,
    }))
    .sort((left, right) => right.prestige_points - left.prestige_points);
}

export function GameEndView({
  ownClub,
  snapshot,
}: {
  ownClub?: LobbyClub;
  snapshot: LobbySnapshot;
}) {
  const prestige = snapshot.prestige;
  const ranking = buildRanking(snapshot, prestige);
  const winner =
    prestige?.winner_club_id != null
      ? ranking.find((club) => club.club_id === prestige.winner_club_id) ?? ranking[0] ?? null
      : resolvePrestigeWinner(
          ranking.map((club) => ({
            club_id: club.club_id,
            club_name: club.club_name,
            manager_name: club.manager_name,
            prestige_points: club.prestige_points,
            continental_wins: club.continental_wins,
            season_rank: club.season_rank,
          })),
        );
  const isOwnWinner = winner?.club_id === ownClub?.id;

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden border-amber-600/50 bg-gradient-to-br from-amber-950/50 via-zinc-950 to-zinc-950">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500" />
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-200">
              <Crown size={32} aria-hidden />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Spiel beendet</p>
            <h2 className="mt-2 text-3xl font-semibold text-zinc-50 sm:text-4xl">
              {winner?.club_name ?? "Unentschieden"}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {winner?.manager_name ? `Manager: ${winner.manager_name}` : "Sieger nach Prestige-Rennen"}
            </p>
            {winner ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Badge tone="amber">{winner.prestige_points} Prestige</Badge>
                {winner.continental_wins > 0 ? (
                  <Badge tone="blue">
                    <Trophy size={12} aria-hidden />
                    {winner.continental_wins}x Continental Cup
                  </Badge>
                ) : null}
                {isOwnWinner ? <Badge tone="green">Dein Sieg</Badge> : null}
              </div>
            ) : null}
            {isOwnWinner ? (
              <p className="mt-4 max-w-xl text-sm text-emerald-200">
                Glückwunsch — du hast das Prestige-Rennen gewonnen und diesen Spielstand fuer dich entschieden.
              </p>
            ) : (
              <p className="mt-4 max-w-xl text-sm text-zinc-400">
                Die finale Saison ist abgeschlossen. Der Manager mit dem hoechsten Prestige gewinnt — bei Gleichstand
                entscheiden Continental-Cup-Siege, Tabellenplatz und Vereinsname.
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Endstand Prestige-Rennen</PanelTitle>
            <PanelDescription>Finale Wertung aller Manager in diesem Spielstand.</PanelDescription>
          </div>
          <Medal size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>

        <div className="space-y-3">
          {ranking.map((club, index) => {
            const isWinner = club.club_id === winner?.club_id;
            const isOwn = club.club_id === ownClub?.id;

            return (
              <div
                key={club.club_id}
                className={cn(
                  "rounded-lg border p-4",
                  isWinner
                    ? "border-amber-500/60 bg-amber-950/25"
                    : isOwn
                      ? "border-[var(--club-color)] bg-[var(--club-color)]/10"
                      : "border-zinc-800 bg-zinc-900/50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-semibold text-zinc-500">#{index + 1}</span>
                    <ClubBadge clubColor={club.club_color} clubName={club.club_name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{club.club_name}</p>
                      <p className="truncate text-xs text-zinc-500">{club.manager_name}</p>
                    </div>
                    {isWinner ? <Badge tone="amber">Sieger</Badge> : null}
                    {isOwn ? <Badge tone="blue">du</Badge> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">{club.prestige_points} Prestige</Badge>
                    {club.continental_wins > 0 ? (
                      <Badge tone="blue">
                        <Trophy size={12} aria-hidden />
                        {club.continental_wins}x CL
                      </Badge>
                    ) : null}
                    {"philosophy_fulfilled" in club && club.philosophy_fulfilled ? (
                      <Badge tone="green">Philosophie</Badge>
                    ) : null}
                  </div>
                </div>
                {"philosophy_label" in club && club.philosophy_label ? (
                  <p className="mt-2 text-xs text-zinc-500">Philosophie: {club.philosophy_label}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-800 px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700"
          href={`/games/${snapshot.game.room_code}?view=prestige`}
        >
          Prestige-Uebersicht
        </Link>
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
          href="/lobby"
        >
          <ArrowLeft size={16} aria-hidden />
          Zurueck zu den Savegames
        </Link>
      </div>
    </div>
  );
}
