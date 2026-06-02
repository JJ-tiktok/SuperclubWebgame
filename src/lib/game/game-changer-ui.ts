import type {
  ClubPendingEffectSnapshot,
  GameChangerCategory,
  LobbyClub,
  MatchNewsSnapshot,
} from "@/lib/lobby/types";

export type NewsCategory = GameChangerCategory | "injury";

export type CategoryStyle = {
  bg: string;
  border: string;
  accent: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  label: string;
};

export const GAME_CHANGER_CATEGORY_STYLES: Record<NewsCategory, CategoryStyle> = {
  good_news: {
    bg: "bg-green-950",
    border: "border-green-600",
    accent: "text-green-300",
    chipBg: "bg-green-950/70",
    chipBorder: "border-green-700/50",
    chipText: "text-green-300",
    label: "Good News",
  },
  bad_news: {
    bg: "bg-rose-950",
    border: "border-rose-600",
    accent: "text-rose-300",
    chipBg: "bg-rose-950/70",
    chipBorder: "border-rose-700/50",
    chipText: "text-rose-300",
    label: "Bad News",
  },
  secret_weapon: {
    bg: "bg-violet-950",
    border: "border-violet-600",
    accent: "text-violet-300",
    chipBg: "bg-violet-950/70",
    chipBorder: "border-violet-700/50",
    chipText: "text-violet-300",
    label: "Geheimwaffe",
  },
  injury: {
    bg: "bg-amber-950",
    border: "border-amber-600",
    accent: "text-amber-300",
    chipBg: "bg-amber-950/70",
    chipBorder: "border-amber-700/50",
    chipText: "text-amber-300",
    label: "Verletzung",
  },
};

export const PENDING_SCOPE_LABELS: Record<ClubPendingEffectSnapshot["scope"], string> = {
  next_match: "Naechstes Spiel",
  next_transfer: "Naechster Transfer",
  current_offseason: "Diese Offseason",
  next_offseason: "Naechste Offseason",
  this_season: "Diese Saison",
};

export function getSeenStorageKey(gameId: string): string {
  return `superclub_gc_seen_${gameId}`;
}

export function getShownNewsIdsKey(gameId: string): string {
  return `superclub_gc_shown_news_ids_${gameId}`;
}

/** News-IDs, die in dieser Browser-Session bereits im Modal angezeigt wurden (ueberlebt View-Wechsel). */
export function getShownNewsIds(gameId: string): Set<string> {
  if (typeof globalThis.sessionStorage === "undefined") return new Set();
  try {
    const raw = globalThis.sessionStorage.getItem(getShownNewsIdsKey(gameId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markNewsIdsShown(gameId: string, ids: string[]): void {
  if (typeof globalThis.sessionStorage === "undefined" || ids.length === 0) return;
  const set = getShownNewsIds(gameId);
  for (const id of ids) set.add(id);
  globalThis.sessionStorage.setItem(getShownNewsIdsKey(gameId), JSON.stringify([...set]));
}

export function isNewsShownInSession(gameId: string, newsId: string): boolean {
  return getShownNewsIds(gameId).has(newsId);
}

export function getLastSeenAt(gameId: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(getSeenStorageKey(gameId)) ?? "";
}

export function setLastSeenAt(gameId: string, createdAt: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getSeenStorageKey(gameId), createdAt);
}

export function resolveClubName(clubs: LobbyClub[], clubId: string | null | undefined): string | null {
  if (!clubId) return null;
  return clubs.find((c) => c.id === clubId)?.club_name ?? null;
}

export function parseGameChangerHeadline(headline: string): string {
  const prefix = "Game Changer: ";
  if (headline.startsWith(prefix)) return headline.slice(prefix.length);
  const secretPrefix = "Geheimwaffe eingesetzt: ";
  if (headline.startsWith(secretPrefix)) return headline.slice(secretPrefix.length);
  return headline;
}

export function formatNewsTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatNewsDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function describePendingEffect(effect: ClubPendingEffectSnapshot): string {
  const p = effect.payload as Record<string, unknown>;
  switch (effect.effect_type) {
    case "next_match_zone_delta": {
      const delta = Number(p.delta ?? 0);
      const zone = (p.zone as string | null) ?? "(Auswahl)";
      return `Zone ${zone}: ${delta >= 0 ? "+" : ""}${delta}`;
    }
    case "next_match_staff_disabled":
      return "Staff-Boni deaktiviert";
    case "next_match_draw_dice_bonus":
      return `+${Number(p.bonus ?? 0)} Wuerfel bei Unentschieden`;
    case "next_match_lineup_locked":
      return "Aufstellung gesperrt";
    case "training_capacity_delta": {
      const delta = p.delta;
      if (delta === "double") return "Trainingseinheiten verdoppelt";
      return `${Number(delta ?? 0) >= 0 ? "+" : ""}${delta} Trainingseinheit(en)`;
    }
    case "free_scouting_draw":
      return `${Number(p.count ?? 0)} gratis Scout-Draw(s)`;
    case "free_scouting_buy_next":
      return "Naechster Spielerkauf gratis";
    case "free_staff_offer":
      return "Gratis Staff-Offerte";
    case "free_staff_signing":
      return "Gratis Staff-Verpflichtung";
    case "next_transfer_price_delta": {
      const amount = Number(p.amount ?? 0);
      return amount >= 0
        ? `Naechster Transfer +${Math.round(amount / 1_000_000)} Mio`
        : `Naechster Transfer ${Math.round(amount / 1_000_000)} Mio`;
    }
    case "offseason_lock":
      return `Gesperrt: ${(p.blocks as string[] | undefined)?.join(", ") ?? ""}`;
    default:
      return effect.effect_type;
  }
}

export function findPendingEffectForNews(
  item: MatchNewsSnapshot,
  pendingEffects: ClubPendingEffectSnapshot[],
): ClubPendingEffectSnapshot | undefined {
  if (item.club_game_changer_id) {
    return pendingEffects.find((e) => e.source_club_game_changer_id === item.club_game_changer_id);
  }
  return undefined;
}

export function countUnreadOwnNews(
  news: MatchNewsSnapshot[],
  ownClubId: string | undefined,
  gameId: string,
): number {
  if (!ownClubId) return 0;
  const lastSeenAt = getLastSeenAt(gameId);
  return news.filter((item) => item.club_id === ownClubId && item.created_at > lastSeenAt).length;
}

export function getCategoryStyle(category: string): CategoryStyle {
  return GAME_CHANGER_CATEGORY_STYLES[category as NewsCategory] ?? GAME_CHANGER_CATEGORY_STYLES.good_news;
}
