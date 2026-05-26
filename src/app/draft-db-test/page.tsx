import { DbDraftTestBoard } from "@/components/draft/DbDraftTestBoard";
import { DRAFT_PLAYER_SELECT, mapDbPlayerToPlayerCardData } from "@/lib/lobby/draft";
import type { DraftPlayerRow } from "@/lib/lobby/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DraftDbTestPage() {
  const result = await loadDraftPlayers();

  return <DbDraftTestBoard result={result} />;
}

async function loadDraftPlayers() {
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    return { ok: false as const, error: "Supabase Service Client ist nicht konfiguriert." };
  }

  const { data, error } = await supabase
    .from("players")
    .select(DRAFT_PLAYER_SELECT)
    .in("visibility", ["public", "room"])
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<DraftPlayerRow[]>();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return {
    ok: true as const,
    players: (data ?? []).map(mapDbPlayerToPlayerCardData),
  };
}
