import { parseEffects, categoryLabel } from "@/lib/game/game-changer-effects";
import type { GameChangerCategory } from "@/lib/lobby/types";
import { summarizeCardEffects } from "@/lib/game/game-changer-catalog";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type GameChangerCatalogCard = {
  id: string;
  content_key: string;
  display_name: string;
  description: string;
  category: GameChangerCategory;
  categoryLabel: string;
  timing: string | null;
  play_window: string | null;
  draw_weight: number;
  visibility: string | null;
  effects: ReturnType<typeof parseEffects>;
  summary: ReturnType<typeof summarizeCardEffects>;
};

export async function loadGameChangerCatalog(): Promise<{ ok: true; cards: GameChangerCatalogCard[] } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return { ok: false, error: "Supabase service client is not configured." };
  }

  type CardRow = {
    id: string;
    content_key: string;
    display_name: string;
    description: string;
    category: GameChangerCategory;
    timing: string | null;
    play_window?: string | null;
    draw_weight?: number | null;
    visibility: string | null;
    effects: unknown;
  };

  const runQuery = async (withV4: boolean) => {
    const select = withV4
      ? "id, content_key, display_name, description, category, timing, play_window, draw_weight, visibility, effects"
      : "id, content_key, display_name, description, category, timing, visibility, effects";
    return supabase.from("game_changer_cards").select(select).order("category").order("display_name");
  };

  let { data, error } = await runQuery(true);
  if (error?.code === "42703") {
    const fallback = await runQuery(false);
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as unknown as CardRow[];
  const cards: GameChangerCatalogCard[] = rows.map((typed) => {
    const effects = parseEffects(typed.effects);
    return {
      id: typed.id,
      content_key: typed.content_key,
      display_name: typed.display_name,
      description: typed.description,
      category: typed.category,
      categoryLabel: categoryLabel(typed.category),
      timing: typed.timing,
      play_window: typed.play_window ?? null,
      draw_weight: Math.max(1, Math.trunc(Number(typed.draw_weight ?? 1))),
      visibility: typed.visibility,
      effects,
      summary: summarizeCardEffects(effects),
    };
  });

  return { ok: true, cards };
}
