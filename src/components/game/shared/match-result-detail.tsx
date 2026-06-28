"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { getThirdLabel } from "@/components/game/lib/dashboard-helpers";
import { ARCHETYPE_META, type PlayerArchetype } from "@/lib/lobby/archetypes";
import { resolveDisplayZoneBoosts, type ZoneModifier } from "@/lib/game/game-changer-effects";
import type { LobbySnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";
import { getClubPlayerDisplayName } from "@/lib/lobby/player-names";

export type FixtureThird = {
  archetype_effects?: FixtureArchetypeEffect[];
  away: { dice: [number, number]; dice_faces?: number; total: number; zone_stars: number };
  home: { dice: [number, number]; dice_faces?: number; total: number; zone_stars: number };
  index: number;
  label: "away_attack" | "home_attack" | "midfield";
};

export type FixtureArchetypeEffect = {
  attacker_archetype?: PlayerArchetype | null;
  attacker_delta: number;
  attacker_player_name?: string | null;
  defender_archetype?: PlayerArchetype | null;
  defender_delta: number;
  defender_player_name?: string | null;
  pair: "best" | "worst";
  winner: "attacker" | "defender" | "neutral";
};

export type FixtureEvent = {
  club_id?: string | null;
  dice: [number, number];
  event_type: "game_changer" | "injury";
  participant_id: string;
  player_id?: string;
  third_index: number;
  zone: string;
};

export type MatchResultParticipantLike = {
  kind: "human" | "cpu";
  display_name: string;
  club_id?: string | null;
};

export type MatchResultFixtureLike = {
  id?: string;
  status: string;
  home_score?: number | null;
  away_score?: number | null;
  home_third_points?: number | null;
  away_third_points?: number | null;
  home_locked_def?: number | null;
  home_locked_mid?: number | null;
  home_locked_att?: number | null;
  away_locked_def?: number | null;
  away_locked_mid?: number | null;
  away_locked_att?: number | null;
  partial_result?: Record<string, unknown> | null;
};

export function parseFixtureResult(value: Record<string, unknown> | null | undefined) {
  if (!value || !Array.isArray(value.thirds)) {
    return null;
  }

  return value as {
    events: FixtureEvent[];
    thirds: FixtureThird[];
  };
}

export function MatchResultDetail({
  animateReveal = false,
  away,
  events,
  fixture,
  home,
  snapshot,
  thirds,
}: {
  animateReveal?: boolean;
  away: MatchResultParticipantLike;
  events: FixtureEvent[];
  fixture: MatchResultFixtureLike;
  home: MatchResultParticipantLike;
  snapshot: LobbySnapshot;
  thirds: FixtureThird[];
}) {
  const revealStorageKey = fixture.id ? `match-reveal-${fixture.id}` : null;
  const alreadyRevealed =
    typeof window !== "undefined" && revealStorageKey ? window.sessionStorage.getItem(revealStorageKey) === "1" : false;
  const shouldAnimate = animateReveal && thirds.length === 3 && !alreadyRevealed;
  const [revealedCount, setRevealedCount] = useState(shouldAnimate ? 0 : thirds.length);
  const animationKeyRef = useRef(`${fixture.status}-${thirds.length}`);

  useEffect(() => {
    const animationKey = `${fixture.status}-${thirds.length}`;
    if (!shouldAnimate) {
      setRevealedCount(thirds.length);
      animationKeyRef.current = animationKey;
      return;
    }

    if (animationKeyRef.current !== animationKey) {
      animationKeyRef.current = animationKey;
      setRevealedCount(0);
    }
  }, [fixture.status, shouldAnimate, thirds.length]);

  useEffect(() => {
    if (!shouldAnimate || revealedCount < thirds.length || !revealStorageKey) {
      return;
    }
    window.sessionStorage.setItem(revealStorageKey, "1");
  }, [revealedCount, revealStorageKey, shouldAnimate, thirds.length]);

  useEffect(() => {
    if (!shouldAnimate || revealedCount >= thirds.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRevealedCount((count) => Math.min(count + 1, thirds.length));
    }, 800);

    return () => window.clearTimeout(timer);
  }, [revealedCount, shouldAnimate, thirds.length]);

  const visibleThirds = thirds.slice(0, revealedCount);
  const visibleEvents = shouldAnimate && revealedCount < thirds.length ? [] : events;
  const liveHomeThirdPoints = visibleThirds.reduce((sum, third) => {
    if (third.home.total > third.away.total) return sum + 1;
    if (third.home.total === third.away.total) return sum + 0.5;
    return sum;
  }, 0);
  const liveAwayThirdPoints = visibleThirds.reduce((sum, third) => {
    if (third.away.total > third.home.total) return sum + 1;
    if (third.away.total === third.home.total) return sum + 0.5;
    return sum;
  }, 0);
  const isCompleted = fixture.status === "completed";
  const displayHomeThirdPoints =
    isCompleted && (!shouldAnimate || revealedCount >= thirds.length)
      ? (fixture.home_third_points ?? liveHomeThirdPoints)
      : liveHomeThirdPoints;
  const displayAwayThirdPoints =
    isCompleted && (!shouldAnimate || revealedCount >= thirds.length)
      ? (fixture.away_third_points ?? liveAwayThirdPoints)
      : liveAwayThirdPoints;
  const homeWins = displayHomeThirdPoints > displayAwayThirdPoints;
  const awayWins = displayAwayThirdPoints > displayHomeThirdPoints;
  const partialModifiers = (fixture.partial_result as { pending_modifiers?: ZoneModifier[] } | null)?.pending_modifiers;
  const seasonZoneBoostsByClub = snapshot.season?.next_match_zone_boosts_by_club_id ?? {};
  const homeZoneBoosts = resolveDisplayZoneBoosts({
    clubId: home.club_id,
    partialModifiers,
    seasonBoostsByClubId: seasonZoneBoostsByClub,
    side: "home",
  });
  const awayZoneBoosts = resolveDisplayZoneBoosts({
    clubId: away.club_id,
    partialModifiers,
    seasonBoostsByClubId: seasonZoneBoostsByClub,
    side: "away",
  });

  function formatLockedZonePower(
    base: number | null | undefined,
    zone: "ATT" | "DEF" | "MID",
    boosts: Record<"ATT" | "DEF" | "MID", number>,
  ) {
    if (base == null) return null;
    const boost = boosts[zone] ?? 0;
    return boost !== 0 ? `${base + boost} (+${boost})` : String(base);
  }

  function ThirdIcon({ label }: { label: FixtureThird["label"] }) {
    if (label === "midfield") return <ArrowLeftRight className="h-4 w-4 text-zinc-500" />;
    if (label === "home_attack") return <ArrowUpRight className="h-4 w-4 rotate-45 text-emerald-400" />;
    return <ArrowDownRight className="h-4 w-4 -rotate-45 text-sky-400" />;
  }

  function ThirdRow({
    diceSum,
    diceType,
    isWinner,
    label,
    side,
    stars,
    total,
  }: {
    diceSum: string;
    diceType: string;
    isWinner: boolean;
    label: string;
    side: "Heim" | "Ausw";
    stars: number;
    total: number;
  }) {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded px-3 py-2 text-xs",
          isWinner ? "border border-emerald-700/40 bg-emerald-950/30" : "bg-zinc-800/40",
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("w-8 font-mono font-semibold", isWinner ? "text-emerald-300" : "text-zinc-500")}>
            {side}
          </span>
          <span className={cn("font-semibold", isWinner ? "text-zinc-100" : "text-zinc-400")}>{stars}</span>
          <span className="text-zinc-600">+ {label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-zinc-500">{diceType}</span>
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded font-bold",
              isWinner
                ? "border border-emerald-600/50 bg-emerald-900/50 text-emerald-300"
                : "border border-zinc-700 bg-zinc-800 text-zinc-300",
            )}
          >
            {diceSum}
          </span>
          <span className="text-zinc-600">=</span>
          <span
            className={cn(
              "min-w-[2rem] text-right text-base font-bold tabular-nums",
              isWinner ? "text-emerald-300" : "text-zinc-300",
            )}
          >
            {total}
          </span>
        </div>
      </div>
    );
  }

  function formatArchetypeEffect(effect: FixtureArchetypeEffect) {
    const attackerName = effect.attacker_player_name ?? "Angriff";
    const defenderName = effect.defender_player_name ?? "Abwehr";
    const attackerType = effect.attacker_archetype ? ARCHETYPE_META[effect.attacker_archetype].attackLabel : "neutral";
    const defenderType = effect.defender_archetype ? ARCHETYPE_META[effect.defender_archetype].defenseLabel : "neutral";
    const delta =
      effect.winner === "attacker"
        ? `ATT +${effect.attacker_delta} / DEF ${effect.defender_delta}`
        : effect.winner === "defender"
          ? `DEF +${effect.defender_delta} / ATT ${effect.attacker_delta}`
          : "neutral";

    return `${effect.pair === "best" ? "Top" : "Low"}: ${attackerName} (${attackerType}) vs ${defenderName} (${defenderType}) - ${delta}`;
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div
            className={cn(
              "min-w-0 flex-1 rounded-lg p-3",
              homeWins ? "border border-emerald-700/40 bg-emerald-950/30" : "border border-zinc-800 bg-zinc-900/50",
            )}
          >
            <p className={cn("truncate text-sm font-semibold", homeWins ? "text-emerald-200" : "text-zinc-300")} title={home.display_name}>
              {home.display_name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">{home.kind === "cpu" ? "CPU" : "Manager"}</p>
            <div className="mt-2 flex gap-2 text-xs">
              {[
                { z: "DEF" as const, v: fixture.home_locked_def },
                { z: "MID" as const, v: fixture.home_locked_mid },
                { z: "ATT" as const, v: fixture.home_locked_att },
              ].map(({ z, v }) =>
                v != null ? (
                  <div className="flex flex-col items-center rounded bg-zinc-800/60 px-2 py-1" key={z}>
                    <span className="text-zinc-500">{z}</span>
                    <span className={cn("font-bold", homeWins ? "text-emerald-300" : "text-zinc-200")}>
                      {formatLockedZonePower(v, z, homeZoneBoosts)}
                    </span>
                  </div>
                ) : null,
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <div
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  homeWins ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400",
                )}
              >
                <span className="text-zinc-600">Drittel </span>
                {displayHomeThirdPoints}
              </div>
              <div
                className={cn(
                  "rounded px-2 py-1 text-xs font-semibold",
                  homeWins ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400",
                )}
              >
                <span className="text-zinc-600">Punkte </span>
                {isCompleted && (!shouldAnimate || revealedCount >= thirds.length) ? (fixture.home_score ?? 0) : "–"}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <div className="flex items-center gap-1 text-3xl font-black tabular-nums">
              <span className={cn(homeWins ? "text-emerald-400" : "text-zinc-500")}>{displayHomeThirdPoints}</span>
              <span className="text-zinc-700">:</span>
              <span className={cn(awayWins ? "text-emerald-400" : "text-zinc-500")}>{displayAwayThirdPoints}</span>
            </div>
            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
              {isCompleted
                ? shouldAnimate && revealedCount < thirds.length
                  ? `${revealedCount}/3 Drittel`
                  : "Final"
                : `${visibleThirds.length}/3 Drittel`}
            </span>
          </div>

          <div
            className={cn(
              "min-w-0 flex-1 rounded-lg p-3 text-right",
              awayWins ? "border border-emerald-700/40 bg-emerald-950/30" : "border border-zinc-800 bg-zinc-900/50",
            )}
          >
            <p className={cn("truncate text-sm font-semibold", awayWins ? "text-emerald-200" : "text-zinc-300")} title={away.display_name}>
              {away.display_name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">{away.kind === "cpu" ? "CPU" : "Manager"}</p>
            <div className="mt-2 flex justify-end gap-2 text-xs">
              {[
                { z: "DEF" as const, v: fixture.away_locked_def },
                { z: "MID" as const, v: fixture.away_locked_mid },
                { z: "ATT" as const, v: fixture.away_locked_att },
              ].map(({ z, v }) =>
                v != null ? (
                  <div className="flex flex-col items-center rounded bg-zinc-800/60 px-2 py-1" key={z}>
                    <span className="text-zinc-500">{z}</span>
                    <span className={cn("font-bold", awayWins ? "text-emerald-300" : "text-zinc-200")}>
                      {formatLockedZonePower(v, z, awayZoneBoosts)}
                    </span>
                  </div>
                ) : null,
              )}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <div
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  awayWins ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400",
                )}
              >
                <span className="text-zinc-600">Drittel </span>
                {displayAwayThirdPoints}
              </div>
              <div
                className={cn(
                  "rounded px-2 py-1 text-xs font-semibold",
                  awayWins ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400",
                )}
              >
                <span className="text-zinc-600">Punkte </span>
                {isCompleted && (!shouldAnimate || revealedCount >= thirds.length) ? (fixture.away_score ?? 0) : "–"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {visibleThirds.map((third) => {
          const homeWinsThird = third.home.total > third.away.total;
          const awayWinsThird = third.away.total > third.home.total;
          const topBorderClass = homeWinsThird || awayWinsThird ? "border-t-emerald-600" : "border-t-zinc-700";
          return (
            <div
              className={cn("rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 border-t-2", topBorderClass)}
              key={third.index}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-200">
                  Drittel {third.index}: {getThirdLabel(third.label)}
                </p>
                <ThirdIcon label={third.label} />
              </div>
              <div className="space-y-1.5">
                <ThirdRow
                  diceSum={third.home.dice.join("+")}
                  diceType={`2W${third.home.dice_faces ?? 6}`}
                  isWinner={homeWinsThird}
                  label={`Wurf ${third.home.dice[0] + third.home.dice[1]}`}
                  side="Heim"
                  stars={third.home.zone_stars}
                  total={third.home.total}
                />
                <ThirdRow
                  diceSum={third.away.dice.join("+")}
                  diceType={`2W${third.away.dice_faces ?? 6}`}
                  isWinner={awayWinsThird}
                  label={`Wurf ${third.away.dice[0] + third.away.dice[1]}`}
                  side="Ausw"
                  stars={third.away.zone_stars}
                  total={third.away.total}
                />
                {third.archetype_effects?.length ? (
                  <div className="mt-2 space-y-1 rounded border border-zinc-800 bg-black/20 p-2">
                    {third.archetype_effects.map((effect, effectIndex) => (
                      <p className="text-[11px] leading-snug text-zinc-400" key={`${third.index}-${effect.pair}-${effectIndex}`}>
                        {formatArchetypeEffect(effect)}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {visibleEvents.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">Ereignisse</p>
          {visibleEvents.map((event, index) => {
            const eventClubName =
              home.club_id === event.club_id
                ? home.display_name
                : away.club_id === event.club_id
                  ? away.display_name
                  : "Unbekannt";
            const ownSquad = snapshot.club_overview?.squad ?? [];
            const injuredOwnedPlayer = event.event_type === "injury" ? ownSquad.find((player) => player.id === event.player_id) : null;
            const injuredPlayer = injuredOwnedPlayer ? getClubPlayerDisplayName(injuredOwnedPlayer) : null;
            const zoneLabel =
              event.zone === "ATT"
                ? "Angriff"
                : event.zone === "MID"
                  ? "Mittelfeld"
                  : event.zone === "DEF"
                    ? "Abwehr"
                    : event.zone;
            return (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-md border p-2.5 text-xs",
                  event.event_type === "injury"
                    ? "border-rose-800/60 bg-rose-950/30"
                    : "border-violet-800/60 bg-violet-950/30",
                )}
                key={`${event.event_type}-${index}`}
              >
                <span className="mt-0.5 text-base leading-none">{event.event_type === "injury" ? "🚑" : "🎯"}</span>
                <div>
                  <p
                    className={cn(
                      "font-semibold",
                      event.event_type === "injury" ? "text-rose-200" : "text-violet-200",
                    )}
                  >
                    {event.event_type === "injury" ? "Verletzung" : "Game Changer"}{" "}
                    <span className="font-normal text-zinc-400">— {eventClubName}</span>
                  </p>
                  <p className="mt-0.5 text-zinc-400">
                    {event.event_type === "injury" ? (
                      <>
                        {injuredPlayer ? (
                          <span className="font-medium text-rose-300">{injuredPlayer}</span>
                        ) : (
                          "Spieler verletzt"
                        )}{" "}
                        in Zone {zoneLabel} · Wurf {event.dice.join("+")}
                      </>
                    ) : (
                      <>
                        Zone {zoneLabel} · Wurf {event.dice.join("+")}
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
