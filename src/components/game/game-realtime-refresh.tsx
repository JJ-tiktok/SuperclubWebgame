"use client";

import { useSession } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClerkBrowserClient } from "@/lib/supabase/client";

export function GameRealtimeRefresh({ gameId }: { gameId: string }) {
  const { session, isLoaded } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !session) {
      return;
    }

    const activeSession = session;
    const supabase = createClerkBrowserClient(() => activeSession.getToken());
    if (!supabase) {
      return;
    }

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => router.refresh();

    async function subscribe() {
      const token = await activeSession.getToken();

      if (!active) {
        return;
      }

      if (!token) {
        return;
      }

      supabase!.realtime.setAuth(token);

      channel = supabase!
        .channel(`game-${gameId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "clubs", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "game_members", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "draft_rounds", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "scouting_draws", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "fixtures", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "season_standings", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `game_id=eq.${gameId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "club_players" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "club_staff" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "staff_offers" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `game_id=eq.${gameId}` }, refresh)
        .subscribe();
    }

    void subscribe();

    // Polling fallback: refresh every 15 s in case Realtime misses an event
    const pollInterval = setInterval(refresh, 15_000);

    return () => {
      active = false;
      clearInterval(pollInterval);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [gameId, isLoaded, router, session]);

  return null;
}
