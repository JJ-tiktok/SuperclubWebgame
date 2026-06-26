import {
  buildPendingChoice,
  describeEffect,
  effectToPendingScope,
  getMatchCardChoiceKind,
  type EffectScope,
  type GameChangerEffect,
} from "@/lib/game/game-changer-effects";
import { PENDING_SCOPE_LABELS } from "@/lib/game/game-changer-ui";
import type { ClubPendingEffectSnapshot } from "@/lib/lobby/types";

export type GameChangerApplicationMode =
  | "immediate"
  | "pending"
  | "choice"
  | "targeted_injury"
  | "match_card"
  | "unsupported";

const MATCH_CARD_EFFECT_TYPES = new Set<GameChangerEffect["type"]>([
  "third_boost",
  "third_penalty",
  "reroll_third",
  "swap_dice_with_opponent",
  "injure_random_opponent",
  "steal_money",
  "extra_training_attempt",
  "match_zone_boost",
  "man_marking",
  "captain_reassign",
  "lineup_reopen",
  "injure_opponent",
  "derby_day",
  "var_reroll",
  "heal_injury_choice",
  "retroactive_win_attempt",
]);

export type EffectDryRunRow = {
  effect: GameChangerEffect;
  mode: GameChangerApplicationMode;
  description: string;
  scope: EffectScope | null;
  scopeLabel: string | null;
  choiceHint: string | null;
};

function choiceHintForEffect(effect: GameChangerEffect): string | null {
  const pendingChoice = buildPendingChoice(effect);
  if (pendingChoice?.type === "pick_player") return "Spieler aus Kader waehlen";
  if (pendingChoice?.type === "pick_zone") return "Zone ATT/MID/DEF waehlen";
  if (pendingChoice?.type === "pick_release_players") {
    return `Spieler im Wert von ${pendingChoice.stars} Sternen entlassen`;
  }
  return null;
}

function matchCardHint(effect: GameChangerEffect): string | null {
  const kind = getMatchCardChoiceKind([effect]);
  if (kind === "zone") return "Zone vor Spiel waehlen";
  if (kind === "defender") return "Verteidiger waehlen";
  if (kind === "opponent_player") return "Gegner-Spieler (serverseitig zufaellig)";
  if (kind === "injured_player") return "Verletzten Spieler waehlen";
  if (kind === "captain_player") return "Captain neu waehlen";
  return "Im Matchday / Secret-Weapon-Flow ausloesen";
}

export function classifyGameChangerEffect(effect: GameChangerEffect): GameChangerApplicationMode {
  if (buildPendingChoice(effect)) {
    return "choice";
  }
  if (effect.type === "targeted_injury") {
    return "targeted_injury";
  }
  if (effectToPendingScope(effect)) {
    return "pending";
  }
  if (MATCH_CARD_EFFECT_TYPES.has(effect.type)) {
    return "match_card";
  }
  if (effect.type === "noop") {
    return "unsupported";
  }
  return "immediate";
}

export function dryRunGameChangerEffects(effects: GameChangerEffect[]): EffectDryRunRow[] {
  let choiceIdx = -1;
  for (let i = 0; i < effects.length; i++) {
    if (buildPendingChoice(effects[i])) {
      choiceIdx = i;
      break;
    }
  }

  return effects.map((effect, index) => {
    const mode = index === choiceIdx ? "choice" : classifyGameChangerEffect(effect);
    const pending = effectToPendingScope(effect);
    const scope = pending?.scope ?? null;
    const scopeLabel = scope ? (PENDING_SCOPE_LABELS[scope as ClubPendingEffectSnapshot["scope"]] ?? scope) : null;

    let choiceHint: string | null = null;
    if (mode === "choice") {
      choiceHint = choiceHintForEffect(effect);
    } else if (mode === "match_card") {
      choiceHint = matchCardHint(effect);
    } else if (mode === "targeted_injury") {
      choiceHint = "Ziel per Selektor (zufaellig / Zone / Position)";
    }

    return {
      effect,
      mode,
      description: describeEffect(effect),
      scope,
      scopeLabel,
      choiceHint,
    };
  });
}

export function summarizeCardEffects(effects: GameChangerEffect[]) {
  const rows = dryRunGameChangerEffects(effects);
  const modes = [...new Set(rows.map((row) => row.mode))];
  const scopes = [...new Set(rows.map((row) => row.scope).filter(Boolean))] as EffectScope[];
  return {
    rows,
    modes,
    scopes,
    descriptions: rows.map((row) => row.description),
    hasChoice: rows.some((row) => row.mode === "choice"),
    hasPending: rows.some((row) => row.mode === "pending"),
    hasMatchCard: rows.some((row) => row.mode === "match_card"),
  };
}

export const APPLICATION_MODE_LABELS: Record<GameChangerApplicationMode, string> = {
  immediate: "Sofort (DB)",
  pending: "Pending Effect",
  choice: "Auswahl noetig",
  targeted_injury: "Verletzung (Selektor)",
  match_card: "Match / Geheimwaffe",
  unsupported: "Kein Effekt",
};
