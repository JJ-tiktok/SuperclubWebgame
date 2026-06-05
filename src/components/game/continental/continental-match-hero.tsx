"use client";

import { CalendarDays } from "lucide-react";
import {
  lockContinentalLineupAction,
  resolveContinentalFixtureAction,
} from "@/app/games/actions/continental";
import { FixtureSideCard } from "@/components/game/shared/fixture-side-card";
import { MatchResultDetail, parseFixtureResult, type FixtureThird } from "@/components/game/shared/match-result-detail";
import { getContinentalRoundLabel } from "@/lib/lobby/continental-cup";
import { calculateLineupPower } from "@/lib/lobby/lineup-power";
import type { ContinentalFixtureSnapshot, LobbyClub, LobbySnapshot } from "@/lib/lobby/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { findOwnCurrentFixture } from "./continental-bracket-utils";

function getOwnLineupPowerSummary(snapshot: LobbySnapshot, ownClub?: LobbyClub) {
  const squad = snapshot.club_overview?.squad;
  if (!squad) {
    return null;
  }

  const staffEffects = (snapshot.club_overview?.staff ?? []).flatMap(
    (entry) => entry.card.effects as Array<{ type: string; zone?: string; stars?: number }>,
  );

  const captainBoost = Math.trunc(Number(ownClub?.captain_boost_rank ?? 0));
  const captain =
    ownClub?.captain_club_player_id && captainBoost > 0
      ? { clubPlayerId: ownClub.captain_club_player_id, boost: captainBoost }
      : null;

  return calculateLineupPower(
    squad.map((owned) => ({
      id: owned.id,
      chemistry_left: owned.player.chemistry_left,
      chemistry_right: owned.player.chemistry_right,
      current_stars: owned.current_stars,
      current_zone: owned.current_zone,
      injured: owned.injured,
      lineup_slot: owned.lineup_slot,
      position: owned.player.position,
      positions: owned.player.eligible_positions?.length
        ? owned.player.eligible_positions
        : owned.player.position
          ? [owned.player.position]
          : undefined,
    })),
    staffEffects,
    captain,
  );
}

function makeLockedLineup(
  def: number | null | undefined,
  mid: number | null | undefined,
  att: number | null | undefined,
) {
  return def != null && mid != null && att != null ? { def_stars: def, mid_stars: mid, att_stars: att } : null;
}

export function ContinentalMatchHero({
  continental,
  isHost,
  ownClub,
  snapshot,
}: {
  continental: NonNullable<LobbySnapshot["continental"]>;
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const fixture = findOwnCurrentFixture(continental, ownClub?.id);
  if (!fixture || !ownClub) {
    return null;
  }

  const ownParticipant = continental.participants.find((entry) => entry.club_id === ownClub.id);
  const isEliminated = ownParticipant?.eliminated_round != null;
  const isCurrentRound = fixture.round === continental.current_round && !isEliminated;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
        <CalendarDays size={13} aria-hidden />
        {isCurrentRound
          ? `Dein Continental-Cup-Spiel — ${getContinentalRoundLabel(fixture.round)}`
          : `Letztes eigenes Spiel — ${getContinentalRoundLabel(fixture.round)}`}
      </p>
      <ContinentalFixtureHeroCard
        fixture={fixture}
        isHost={isHost}
        ownClub={ownClub}
        snapshot={snapshot}
      />
    </div>
  );
}

function ContinentalFixtureHeroCard({
  fixture,
  isHost,
  ownClub,
  snapshot,
}: {
  fixture: ContinentalFixtureSnapshot;
  isHost: boolean;
  ownClub: LobbyClub;
  snapshot: LobbySnapshot;
}) {
  const home = fixture.home_participant;
  const away = fixture.away_participant;
  const ownSide = ownClub.id === home.club_id ? "home" : ownClub.id === away.club_id ? "away" : null;
  const ownLocked = ownSide === "home" ? fixture.home_lineup_locked : ownSide === "away" ? fixture.away_lineup_locked : false;
  const hasCpu = home.kind === "cpu" || away.kind === "cpu";
  const bothHumanLocked =
    home.kind === "human" && away.kind === "human" && fixture.home_lineup_locked && fixture.away_lineup_locked;
  const canLock = Boolean(ownSide && fixture.status !== "completed" && !ownLocked);
  const canResolveOwn = Boolean(ownSide && fixture.status !== "completed" && ownLocked && (hasCpu || bothHumanLocked));
  const canHostResolve = Boolean(isHost && !ownSide && fixture.status !== "completed" && bothHumanLocked);
  const ownPowerSummary = getOwnLineupPowerSummary(snapshot, ownClub);

  const homeLineup =
    fixture.home_cpu_lineup ??
    makeLockedLineup(fixture.home_locked_def, fixture.home_locked_mid, fixture.home_locked_att);
  const awayLineup =
    fixture.away_cpu_lineup ??
    makeLockedLineup(fixture.away_locked_def, fixture.away_locked_mid, fixture.away_locked_att);
  const result = parseFixtureResult(fixture.result);
  const partialThirds = ((fixture.partial_result as { thirds?: unknown[] } | null)?.thirds ?? []) as FixtureThird[];
  const showMatchResult =
    (home.kind === "human" || away.kind === "human") && (result != null || partialThirds.length > 0);

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85 shadow-[0_0_20px_rgba(16,185,129,0.08)]">
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_220px]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">
                {getContinentalRoundLabel(fixture.round)}
              </p>
              <h3
                className="mt-1 text-xl font-semibold text-zinc-50"
                title={`${home.display_name} vs ${away.display_name}`}
              >
                <span title={home.display_name}>{home.display_name}</span>{" "}
                <span className="text-zinc-500">vs</span>{" "}
                <span title={away.display_name}>{away.display_name}</span>
              </h3>
            </div>
            <Badge tone={fixture.status === "completed" ? "green" : "amber"}>
              {fixture.status === "completed"
                ? `${fixture.home_score ?? 0} : ${fixture.away_score ?? 0}`
                : "offen"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <FixtureSideCard
              hideStandingStats
              lineup={homeLineup}
              locked={fixture.home_lineup_locked}
              participant={home}
              powerSummary={home.club_id === ownClub.id && fixture.home_lineup_locked ? ownPowerSummary : null}
              score={fixture.home_score}
            />
            <FixtureSideCard
              hideStandingStats
              lineup={awayLineup}
              locked={fixture.away_lineup_locked}
              participant={away}
              powerSummary={away.club_id === ownClub.id && fixture.away_lineup_locked ? ownPowerSummary : null}
              score={fixture.away_score}
            />
          </div>

          {showMatchResult ? (
            <MatchResultDetail
              away={away}
              events={result?.events ?? []}
              fixture={fixture}
              home={home}
              snapshot={snapshot}
              thirds={result?.thirds ?? partialThirds}
            />
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="space-y-2 text-sm text-zinc-400">
            <p>
              {ownSide
                ? ownLocked
                  ? "Deine Aufstellung ist gelockt."
                  : "Locke deine Aufstellung fuer dieses K.o.-Spiel."
                : "Du bist in diesem Fixture Zuschauer."}
            </p>
            <p>CPU-Aufstellungen werden stabil am Fixture gespeichert.</p>
          </div>
          <div className="space-y-2">
            {canLock ? (
              <form action={lockContinentalLineupAction}>
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="fixture_id" type="hidden" value={fixture.id} />
                <Button className="w-full" type="submit" variant="primary">
                  Aufstellung locken
                </Button>
              </form>
            ) : null}
            {canResolveOwn || canHostResolve ? (
              <form action={resolveContinentalFixtureAction}>
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="fixture_id" type="hidden" value={fixture.id} />
                <Button className="w-full" type="submit" variant="primary">
                  Spiel auswerten
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}
