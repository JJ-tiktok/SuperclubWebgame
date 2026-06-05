"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { SmallInfo } from "@/components/game/shared/metric";
import { CPU_TIER_LABEL } from "@/lib/lobby/cpu-teams";
import { formatStars } from "@/components/game/lib/dashboard-helpers";
import type { CpuStrengthTier } from "@/lib/lobby/types";
import type { LineupPowerSummary } from "@/lib/lobby/lineup-power";

export type FixtureParticipantLike = {
  kind: "human" | "cpu";
  display_name: string;
  club_id?: string | null;
  cpu_strength_tier?: CpuStrengthTier | null;
};

export type FixtureLineupLike = {
  def_stars: number;
  mid_stars: number;
  att_stars: number;
} | null;

const LOGO_BY_NAME: Record<string, string> = {
  "Apex River United": "/AprexRiverUnited.png",
  "Blackwood Athletic": "/BlackwoodAthletic.png",
  "Crimson Cape FC": "/crimsonCape.png",
  "FC Dynamo Draft": "/DynamoDraft.png",
  "Golden Meadow United": "/GoldenMeadowUnited.png",
  "Vanguard FC": "/VanguardFC.png",
};

export function getClubLogoSrc(participant: FixtureParticipantLike): string | null {
  if (participant.kind !== "human") {
    return null;
  }
  return LOGO_BY_NAME[participant.display_name] ?? null;
}

function CpuStrengthBadge({ tier }: { tier: CpuStrengthTier }) {
  const label = CPU_TIER_LABEL[tier];
  const className =
    tier === "stark"
      ? "border-rose-500/50 text-rose-200"
      : tier === "mittel"
        ? "border-amber-500/50 text-amber-200"
        : "border-zinc-600 text-zinc-300";

  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

export function FixtureSideCard({
  lineup,
  locked,
  participant,
  powerSummary,
  score,
  thirdPoints,
  zoneBoosts,
  hideStandingStats = false,
}: {
  lineup: FixtureLineupLike;
  locked: boolean;
  participant: FixtureParticipantLike;
  powerSummary?: LineupPowerSummary | null;
  score?: number | null;
  thirdPoints?: number | null;
  zoneBoosts?: Partial<Record<"ATT" | "MID" | "DEF", number>>;
  hideStandingStats?: boolean;
}) {
  const logoSrc = getClubLogoSrc(participant);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {logoSrc ? (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
              <Image alt="" className="object-contain p-1" fill sizes="40px" src={logoSrc} />
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-50" title={participant.display_name}>
              {participant.display_name}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {participant.kind === "cpu"
                ? participant.cpu_strength_tier
                  ? `CPU · ${CPU_TIER_LABEL[participant.cpu_strength_tier]}`
                  : "CPU-Team"
                : "Manager-Team"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {participant.kind === "cpu" && participant.cpu_strength_tier ? (
            <CpuStrengthBadge tier={participant.cpu_strength_tier} />
          ) : null}
          <Badge tone={participant.kind === "cpu" || locked ? "green" : "neutral"}>
            {participant.kind === "cpu" ? "CPU" : locked ? "locked" : "offen"}
          </Badge>
        </div>
      </div>
      {lineup || powerSummary ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {(["DEF", "MID", "ATT"] as const).map((zone) => {
            const total = lineup
              ? Number(zone === "DEF" ? lineup.def_stars : zone === "MID" ? lineup.mid_stars : lineup.att_stars)
              : (powerSummary?.[zone].total ?? 0);
            const staffBonus = powerSummary?.[zone].staffBonus ?? 0;
            const gcBoost = zoneBoosts?.[zone] ?? 0;
            const value =
              gcBoost !== 0
                ? `${formatStars(total + gcBoost)} (+${gcBoost} GC)`
                : staffBonus > 0
                  ? `${formatStars(total)} (+${staffBonus}★)`
                  : formatStars(total);
            return (
              <div key={zone}>
                <SmallInfo label={zone} value={value} />
              </div>
            );
          })}
        </div>
      ) : null}
      {hideStandingStats ? null : (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <SmallInfo label="Drittelpunkte" value={thirdPoints == null ? "-" : formatStars(thirdPoints)} />
          <SmallInfo label="Tabellenpunkte" value={score == null ? "-" : String(score)} />
        </div>
      )}
    </div>
  );
}
