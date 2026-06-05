import type { LineupSnapshotSide } from "@/lib/lobby/lineup-snapshot";
import type { SeasonFixtureSnapshot } from "@/lib/lobby/types";
import { formatStars } from "@/components/game/lib/dashboard-helpers";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Eye } from "lucide-react";

type OpponentIntelPanelProps = {
  analyticsLevel: number;
  opponentClubId: string | null | undefined;
  opponentName: string;
  fixtures: SeasonFixtureSnapshot[];
  liveLineup?: LineupSnapshotSide | null;
};

function extractOpponentLineupFromFixture(
  fixture: SeasonFixtureSnapshot,
  opponentClubId: string,
): LineupSnapshotSide | null {
  const result = fixture.result as { lineup_snapshot?: { home: LineupSnapshotSide; away: LineupSnapshotSide } } | null;
  const snapshot = result?.lineup_snapshot;
  if (!snapshot) {
    return null;
  }

  if (fixture.home_participant.club_id === opponentClubId) {
    return snapshot.home;
  }
  if (fixture.away_participant.club_id === opponentClubId) {
    return snapshot.away;
  }
  return null;
}

function findLastOpponentLineup(fixtures: SeasonFixtureSnapshot[], opponentClubId: string) {
  const completed = fixtures
    .filter((fixture) => fixture.status === "completed")
    .filter(
      (fixture) =>
        fixture.home_participant.club_id === opponentClubId ||
        fixture.away_participant.club_id === opponentClubId,
    )
    .sort(
      (left, right) =>
        right.matchday - left.matchday ||
        String(right.completed_at ?? "").localeCompare(String(left.completed_at ?? "")),
    );

  for (const fixture of completed) {
    const lineup = extractOpponentLineupFromFixture(fixture, opponentClubId);
    if (lineup?.starters?.length) {
      return { lineup, matchday: fixture.matchday };
    }
  }
  return null;
}

function LineupTable({ lineup }: { lineup: LineupSnapshotSide }) {
  if (!lineup.starters.length) {
    return <p className="text-xs text-zinc-500">Keine Startelf gespeichert.</p>;
  }

  return (
    <div className="space-y-1">
      {lineup.starters.map((starter, index) => (
        <div className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs" key={`${starter.display_name}-${index}`}>
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-100">{starter.display_name}</p>
            <p className="text-zinc-500">{starter.zone}</p>
          </div>
          <p className="shrink-0 font-semibold text-[var(--club-color)]">{formatStars(starter.stars)}</p>
        </div>
      ))}
    </div>
  );
}

export function OpponentIntelPanel({
  analyticsLevel,
  opponentClubId,
  opponentName,
  fixtures,
  liveLineup,
}: OpponentIntelPanelProps) {
  if (analyticsLevel < 1 || !opponentClubId) {
    return null;
  }

  const lastMatch = findLastOpponentLineup(fixtures, opponentClubId);
  const showLive = analyticsLevel >= 2 && liveLineup?.starters?.length;

  if (!lastMatch && !showLive) {
    return null;
  }

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>Analyse: {opponentName}</PanelTitle>
          <PanelDescription>
            {showLive ? "Live-Spionage der gelockten Gegner-Aufstellung." : `Letzte Aufstellung (Spieltag ${lastMatch?.matchday ?? "–"}).`}
          </PanelDescription>
        </div>
        <Eye size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="space-y-4 p-4 pt-0">
        {showLive ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Live-Aufstellung</p>
            <LineupTable lineup={liveLineup!} />
          </div>
        ) : null}
        {lastMatch ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Letztes Spiel (Spieltag {lastMatch.matchday})
            </p>
            <LineupTable lineup={lastMatch.lineup} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
