"use client";

import type { ReactNode } from "react";
import { ChevronRight, Trophy } from "lucide-react";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import {
  CONTINENTAL_CPU_TIER_LABEL,
  CONTINENTAL_ROUNDS,
  getContinentalRoundLabel,
} from "@/lib/lobby/continental-cup";
import type {
  ContinentalFixtureSnapshot,
  ContinentalParticipantSnapshot,
  ContinentalTournamentSnapshot,
  LobbyClub,
} from "@/lib/lobby/types";
import { cn } from "@/lib/utils";
import { buildSymmetricBracket, fixtureInvolvesClub, type BracketSlot } from "./continental-bracket-utils";

const COLUMN_SPACING: Record<number, string> = {
  32: "space-y-8",
  16: "space-y-16",
  8: "space-y-32",
  4: "space-y-32",
};

function BracketMatchCard({
  slot,
  ownClubId,
  compact = false,
}: {
  slot: BracketSlot;
  ownClubId: string | undefined;
  compact?: boolean;
}) {
  const fixture = slot.fixture;
  const isOwn = fixture ? fixtureInvolvesClub(fixture, ownClubId) : false;
  const isCompleted = fixture?.status === "completed";

  if (!fixture) {
    return (
      <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/40 p-3 opacity-50">
        <p className="text-center text-[10px] uppercase tracking-wide text-zinc-600">—</p>
      </div>
    );
  }

  const home = fixture.home_participant;
  const away = fixture.away_participant;
  const homeWon = isCompleted && fixture.winner_participant_id === home.id;
  const awayWon = isCompleted && fixture.winner_participant_id === away.id;

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        compact ? "p-2.5" : "p-3",
        isOwn
          ? "border-[var(--club-border)] bg-zinc-900/80 shadow-[0_0_16px_rgba(16,185,129,0.12)]"
          : "border-zinc-800 bg-zinc-900/50",
        isOwn && isCompleted && (homeWon || awayWon) && "border-t-2 border-t-emerald-500",
      )}
    >
      <div className="space-y-1.5">
        <BracketTeamRow
          compact={compact}
          isOwn={home.club_id === ownClubId}
          isWinner={homeWon}
          name={home.display_name}
          participant={home}
          score={isCompleted ? fixture.home_score : null}
        />
        <BracketTeamRow
          compact={compact}
          isOwn={away.club_id === ownClubId}
          isWinner={awayWon}
          name={away.display_name}
          participant={away}
          score={isCompleted ? fixture.away_score : null}
        />
      </div>
    </div>
  );
}

function BracketTeamRow({
  name,
  participant,
  score,
  isOwn,
  isWinner,
  compact = false,
}: {
  name: string;
  participant: ContinentalParticipantSnapshot;
  score: number | null | undefined;
  isOwn: boolean;
  isWinner: boolean;
  compact?: boolean;
}) {
  const tierLabel =
    participant.kind === "cpu" && participant.cpu_strength_tier
      ? CONTINENTAL_CPU_TIER_LABEL[participant.cpu_strength_tier]
      : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 font-medium uppercase tracking-wide",
        compact ? "text-[11px]" : "text-[10px]",
        isWinner && "text-emerald-400",
        !isWinner && score != null && "opacity-50",
        isOwn && !isWinner && score == null && "text-[var(--club-color)]",
      )}
    >
      <span className="min-w-0 truncate" title={tierLabel ? `${name} (${tierLabel})` : name}>
        {name}
        {tierLabel ? (
          <span className={cn("ml-1 font-normal normal-case text-zinc-500", compact ? "text-[10px]" : "text-[9px]")}>
            ({tierLabel})
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-bold">{score != null ? score : ""}</span>
    </div>
  );
}

function BracketConnector({ count }: { count: number }) {
  return (
    <div className="flex h-full flex-col justify-around py-8">
      {Array.from({ length: count }, (_, index) => (
        <div className="h-px w-full bg-gradient-to-r from-zinc-800 via-zinc-600 to-zinc-800" key={index} />
      ))}
    </div>
  );
}

function BracketColumn({
  column,
  ownClubId,
}: {
  column: { round: number; label: string; slots: BracketSlot[] };
  ownClubId: string | undefined;
}) {
  return (
    <div>
      <h3 className="mb-4 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {column.label}
      </h3>
      <div className={cn(COLUMN_SPACING[column.round] ?? "space-y-8")}>
        {column.slots.map((slot) => (
          <BracketMatchCard key={`${slot.round}-${slot.matchIndex}`} ownClubId={ownClubId} slot={slot} />
        ))}
      </div>
    </div>
  );
}

function BracketFinalCenter({
  slot,
  continental,
  ownClubId,
}: {
  slot: BracketSlot;
  continental: ContinentalTournamentSnapshot;
  ownClubId: string | undefined;
}) {
  const fixture = slot.fixture;
  const isCompleted = fixture?.status === "completed";
  const winnerName =
    continental.participants.find((entry) => entry.club_id === continental.winner_club_id)?.display_name ?? null;

  return (
    <div className="flex flex-col items-center justify-center space-y-6 px-2">
      <div className="text-center">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-amber-300">
          Grande Finale
        </span>
        <div
          className={cn(
            "relative mx-auto flex h-28 w-28 items-center justify-center rounded-full border bg-gradient-to-t from-zinc-900 to-zinc-800 p-1",
            isCompleted ? "border-amber-500/50 shadow-[0_0_24px_rgba(251,191,36,0.15)]" : "border-zinc-700",
          )}
        >
          <Trophy className={cn("h-12 w-12", isCompleted ? "text-amber-300" : "text-zinc-500")} aria-hidden />
        </div>
      </div>

      {fixture ? (
        <div className="w-full max-w-[200px]">
          <BracketMatchCard ownClubId={ownClubId} slot={slot} />
        </div>
      ) : (
        <div className="w-full max-w-[200px] rounded-md border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-center">
          <p className="text-xs text-zinc-500">{getContinentalRoundLabel(2)}</p>
          <p className="mt-1 text-[10px] uppercase text-zinc-600">Noch offen</p>
        </div>
      )}

      {continental.winner_club_id && continental.status === "completed" ? (
        <p className="text-center text-xs font-medium text-emerald-400">
          Sieger:{" "}
          <span title={winnerName ?? undefined}>{winnerName ?? "—"}</span>
        </p>
      ) : null}
    </div>
  );
}

function MobileRoundBracket({
  continental,
  ownClubId,
}: {
  continental: ContinentalTournamentSnapshot;
  ownClubId: string | undefined;
}) {
  const roundsWithFixtures = CONTINENTAL_ROUNDS.filter((round) =>
    continental.fixtures.some((fixture) => fixture.round === round),
  );

  return (
    <div className="space-y-5 lg:hidden">
      {roundsWithFixtures.map((round) => {
        const roundFixtures = continental.fixtures
          .filter((fixture) => fixture.round === round)
          .sort((left, right) => left.match_index - right.match_index);
        const isCurrentRound = continental.current_round === round && continental.status !== "completed";

        return (
          <section key={round}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3
                className={cn(
                  "text-xs font-semibold uppercase tracking-widest",
                  isCurrentRound ? "text-emerald-400" : "text-zinc-500",
                )}
              >
                {getContinentalRoundLabel(round)}
              </h3>
              {isCurrentRound ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-300">
                  Aktuelle Runde
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              {roundFixtures.map((fixture) => (
                <MobileFixtureCard fixture={fixture} key={fixture.id} ownClubId={ownClubId} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MobileFixtureCard({
  fixture,
  ownClubId,
}: {
  fixture: ContinentalFixtureSnapshot;
  ownClubId: string | undefined;
}) {
  const isOwn = fixtureInvolvesClub(fixture, ownClubId);
  const isCompleted = fixture.status === "completed";
  const home = fixture.home_participant;
  const away = fixture.away_participant;
  const homeWon = isCompleted && fixture.winner_participant_id === home.id;
  const awayWon = isCompleted && fixture.winner_participant_id === away.id;

  return (
    <div
      className={cn(
        "rounded-md border p-3",
        isOwn ? "border-[var(--club-border)] bg-zinc-900/80" : "border-zinc-800 bg-zinc-900/40",
      )}
    >
      <div className="space-y-1.5">
        <BracketTeamRow
          compact
          isOwn={home.club_id === ownClubId}
          isWinner={homeWon}
          name={home.display_name}
          participant={home}
          score={isCompleted ? fixture.home_score : null}
        />
        <BracketTeamRow
          compact
          isOwn={away.club_id === ownClubId}
          isWinner={awayWon}
          name={away.display_name}
          participant={away}
          score={isCompleted ? fixture.away_score : null}
        />
      </div>
    </div>
  );
}

function DesktopSymmetricBracket({
  continental,
  ownClubId,
}: {
  continental: ContinentalTournamentSnapshot;
  ownClubId: string | undefined;
}) {
  const bracket = buildSymmetricBracket(continental.fixtures);
  const connectorCounts = bracket.leftColumns.map((column) => Math.max(1, Math.floor(column.slots.length / 2)));

  const gridItems: Array<{ key: string; node: ReactNode }> = [];

  bracket.leftColumns.forEach((column, index) => {
    gridItems.push({
      key: `left-${column.round}`,
      node: <BracketColumn column={column} ownClubId={ownClubId} />,
    });
    if (index < bracket.leftColumns.length - 1) {
      gridItems.push({
        key: `conn-left-${column.round}`,
        node: <BracketConnector count={connectorCounts[index] ?? 1} />,
      });
    }
  });

  gridItems.push({
    key: "final",
    node: <BracketFinalCenter continental={continental} ownClubId={ownClubId} slot={bracket.center} />,
  });

  bracket.rightColumns.forEach((column, index) => {
    if (index > 0) {
      gridItems.push({
        key: `conn-right-${column.round}`,
        node: <BracketConnector count={connectorCounts[bracket.rightColumns.length - 1 - index] ?? 1} />,
      });
    }
    gridItems.push({
      key: `right-${column.round}`,
      node: <BracketColumn column={column} ownClubId={ownClubId} />,
    });
  });

  return (
    <div className="relative hidden lg:block">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-zinc-950 to-transparent" />
      <p className="mb-3 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        <ChevronRight size={12} aria-hidden />
        Horizontal scrollen für den vollen Baum
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[1100px] py-6">
          <div
            className="grid items-center gap-0"
            style={{ gridTemplateColumns: `repeat(${gridItems.length}, minmax(0, 1fr))` }}
          >
            {gridItems.map((item) => (
              <div key={item.key}>{item.node}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContinentalBracket({
  continental,
  ownClub,
}: {
  continental: ContinentalTournamentSnapshot;
  ownClub: LobbyClub | undefined;
}) {
  const ownClubId = ownClub?.id;

  return (
    <Panel className="border-zinc-800 bg-zinc-950/70" id="bracket">
      <PanelHeader>
        <div>
          <PanelTitle>Turnierbaum</PanelTitle>
          <PanelDescription>
            Kompakte Rundenansicht auf Mobilgeräten, voller symmetrischer Baum auf Desktop
          </PanelDescription>
        </div>
        <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      <MobileRoundBracket continental={continental} ownClubId={ownClubId} />
      <DesktopSymmetricBracket continental={continental} ownClubId={ownClubId} />
    </Panel>
  );
}
