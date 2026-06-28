import type { ScoutingPileKey } from "@/lib/lobby/scouting";
import type { DraftPlayerRow } from "@/lib/lobby/types";
import { isNlzOriginPlayer } from "@/lib/lobby/youth-generator";

const MARKET_VISIBILITIES = new Set(["public", "room"]);

const REGION_ALIASES: Record<string, ScoutingPileKey | "academy" | "generic"> = {
  academy: "academy",
  africa: "africa",
  afrika: "africa",
  asia: "asia",
  asien: "asia",
  europe: "europe",
  europa: "europe",
  generic: "generic",
  north_america: "north_america",
  nordamerika: "north_america",
  oceania: "oceania",
  ozeanien: "oceania",
  south_america: "south_america",
  suedamerika: "south_america",
  sudamerika: "south_america",
};

export type PlayerPoolRow = Pick<DraftPlayerRow, "metadata" | "region" | "visibility">;

function normalizeRegionInput(region: string): string {
  return region
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export function normalizePlayerRegionKey(region: string | null | undefined): string {
  if (!region) {
    return "generic";
  }

  const normalized = normalizeRegionInput(region);
  return REGION_ALIASES[normalized] ?? normalized;
}

export function isAcademyExclusivePlayer(player: PlayerPoolRow): boolean {
  if (isNlzOriginPlayer(player.metadata)) {
    return true;
  }

  if (normalizePlayerRegionKey(player.region) === "academy") {
    return true;
  }

  return player.visibility === "private";
}

export function isMarketPoolPlayer(player: PlayerPoolRow): boolean {
  if (isAcademyExclusivePlayer(player)) {
    return false;
  }

  return MARKET_VISIBILITIES.has(String(player.visibility ?? ""));
}

export function playerMatchesScoutingPile(player: PlayerPoolRow, pileKey: ScoutingPileKey): boolean {
  return normalizePlayerRegionKey(player.region) === pileKey;
}
