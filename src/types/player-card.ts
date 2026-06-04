import type { PlayerCard } from "@/lib/game/types";
import type { ArchetypeRole, ArchetypeSymbol, PlayerArchetype } from "@/lib/lobby/archetypes";

export type PlayerAgeGroup = "talent" | "prime" | "veteran";
export type ChemistrySymbol = "star" | "dot" | "link";
export type CardTier = "standard" | "rare" | "epic" | "legend" | "veteran";
export type PlayerCardPosition = "GK" | "DEF" | "MID" | "ATT";
export type PlayerPositionGroup = "GK" | "DEF" | "DEF_MID" | "MID" | "MID_ATT" | "ATT" | "ALL";
export type StarState = "filled" | "empty" | "veteran" | "disabled";
export type PlayerCardArchetype = {
  key: PlayerArchetype;
  label: string;
  role: ArchetypeRole;
  symbol: ArchetypeSymbol;
};

export const MINIMUM_FORMATION_COUNTS = {
  ATT: 2,
  DEF: 3,
  MID: 3,
} satisfies Partial<Record<PlayerCardPosition, number>>;

export type PlayerCardData = {
  id: string;
  name: string;
  position: PlayerCardPosition;
  positions: PlayerCardPosition[];
  role?: string;
  nationality?: string;
  age?: number;
  ageGroup: PlayerAgeGroup;
  skill: {
    current: number;
    potential: number;
    max: number;
    veteranFallback?: number | null;
  };
  chemistry: {
    left: boolean;
    right: boolean;
    symbol: ChemistrySymbol;
  };
  archetypes?: {
    attack?: PlayerCardArchetype | null;
    defense?: PlayerCardArchetype | null;
  };
  market: {
    transferFee: number;
    scoutingFee: number;
    currency: string;
  };
  cardStyle: {
    tier: CardTier;
    theme?: string;
  };
};

export type PlayerCardTheme = "blue" | "green" | "gold" | "purple" | "dark";
export type PositionTheme = {
  background: string;
  border: string;
  muted: string;
  text: string;
};

export const positionThemes: Record<PlayerPositionGroup, PositionTheme> = {
  ALL: {
    background: "bg-violet-700",
    border: "border-violet-300/70",
    muted: "text-violet-100/75",
    text: "text-white",
  },
  ATT: {
    background: "bg-emerald-600",
    border: "border-emerald-200/70",
    muted: "text-emerald-50/75",
    text: "text-white",
  },
  DEF: {
    background: "bg-rose-700",
    border: "border-rose-200/70",
    muted: "text-rose-50/75",
    text: "text-white",
  },
  DEF_MID: {
    background: "bg-orange-600",
    border: "border-orange-200/70",
    muted: "text-orange-50/75",
    text: "text-white",
  },
  GK: {
    background: "bg-zinc-50",
    border: "border-rose-400/80",
    muted: "text-rose-500/75",
    text: "text-rose-600",
  },
  MID: {
    background: "bg-amber-400",
    border: "border-amber-100/80",
    muted: "text-amber-950/65",
    text: "text-amber-950",
  },
  MID_ATT: {
    background: "bg-teal-500",
    border: "border-teal-100/75",
    muted: "text-teal-50/80",
    text: "text-white",
  },
};

export function getPositionGroup(positions: PlayerCardPosition[]): PlayerPositionGroup {
  const unique = Array.from(new Set(positions)).sort();
  const key = unique.join("_");

  if (unique.length === 4) {
    return "ALL";
  }

  if (key === "ATT") return "ATT";
  if (key === "DEF") return "DEF";
  if (key === "DEF_MID") return "DEF_MID";
  if (key === "GK") return "GK";
  if (key === "MID") return "MID";
  if (key === "ATT_MID") return "MID_ATT";

  return "ALL";
}

export function getPositionTheme(player: Pick<PlayerCardData, "position" | "positions">) {
  return positionThemes[getPositionGroup(player.positions.length > 0 ? player.positions : [player.position])];
}

export function getPositionLabel(positions: PlayerCardPosition[]) {
  const group = getPositionGroup(positions);
  const labels: Record<PlayerPositionGroup, string> = {
    ALL: "ALL",
    ATT: "ATT",
    DEF: "DEF",
    DEF_MID: "DEF/MID",
    GK: "GK",
    MID: "MID",
    MID_ATT: "MID/ATT",
  };

  return labels[group];
}

export function getSkillStarStates(player: PlayerCardData): StarState[] {
  const stars: StarState[] = [];
  const max = Math.max(0, Math.floor(player.skill.max));
  const total = getTotalSkillValue(player);
  const veteranFallback = player.skill.veteranFallback ?? 0;

  for (let i = 1; i <= max; i += 1) {
    if (i <= total) {
      stars.push("filled");
    } else if (player.ageGroup === "veteran" && veteranFallback > 0 && i <= veteranFallback) {
      stars.push("veteran");
    } else {
      stars.push("empty");
    }
  }

  return stars;
}

export function getTotalSkillValue(player: PlayerCardData) {
  return Math.min(Math.max(0, Math.floor(player.skill.max)), Math.max(player.skill.current, player.skill.potential));
}

export function calculateCardChemistryBonus(players: Array<Pick<PlayerCardData, "chemistry">>) {
  const leftLinks = players.filter((player) => player.chemistry.left).length;
  const rightLinks = players.filter((player) => player.chemistry.right).length;

  return Math.min(leftLinks, rightLinks);
}

export function formatMarketValue(value: number, currency: string) {
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    minimumFractionDigits: 0,
  }).format(value);

  return `${formatted}${currency}`;
}

export function mapEnginePlayerToCardData(player: PlayerCard): PlayerCardData {
  const chemistryLeft = player.chemistry === "left" || player.chemistry === "both";
  const chemistryRight = player.chemistry === "right" || player.chemistry === "both";

  return {
    ageGroup: "prime",
    cardStyle: {
      theme: "dark",
      tier: "standard",
    },
    chemistry: {
      left: chemistryLeft,
      right: chemistryRight,
      symbol: "star",
    },
    id: player.id,
    market: {
      currency: "M",
      scoutingFee: player.scoutingPrice / 1_000_000,
      transferFee: player.minimumBid / 1_000_000,
    },
    name: player.name,
    position: player.position,
    positions: [player.position],
    role: player.region,
    skill: {
      current: player.baseStars,
      max: Math.max(5, player.baseStars + player.potentialStars),
      potential: player.baseStars + player.potentialStars,
      veteranFallback: null,
    },
  };
}
