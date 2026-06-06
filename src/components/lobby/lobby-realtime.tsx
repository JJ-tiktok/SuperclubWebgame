"use client";

import { UserButton, useSession } from "@clerk/nextjs";
import { Check, Copy, Crown, Loader2, Play, Save, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGameAction, setReadyAction, startGameAction } from "@/app/lobby/actions";
import { DevAdminMenu } from "@/components/dev/dev-admin-menu";
import { ClubBadge } from "@/components/game/club-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { canStartLobby } from "@/lib/lobby/rules";
import { getClubTheme } from "@/lib/lobby/theme";
import type { ActionResult, LobbyClub, LobbyGame, LobbyMember, LobbySnapshot } from "@/lib/lobby/types";
import { createClerkBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LobbyRealtime({
  initialSnapshot,
  currentUserId,
}: {
  initialSnapshot: LobbySnapshot;
  currentUserId: string;
}) {
  const [game, setGame] = useState<LobbyGame>(initialSnapshot.game);
  const [clubs, setClubs] = useState<LobbyClub[]>(initialSnapshot.clubs);
  const [members, setMembers] = useState<LobbyMember[]>(initialSnapshot.members);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { session, isLoaded } = useSession();
  const router = useRouter();
  const supabaseConfigured = hasSupabaseBrowserEnv();

  const ownClub = clubs.find((club) => club.clerk_user_id === currentUserId);
  const isHost = game.host_clerk_user_id === currentUserId;
  const readyCount = clubs.filter((club) => club.is_ready).length;
  const startState = canStartLobby(game, clubs, currentUserId);
  const theme = getClubTheme(ownClub);

  const membersByClerkId = useMemo(
    () => Object.fromEntries(members.map((member) => [member.clerk_user_id, member])),
    [members],
  );

  useEffect(() => {
    if (!isLoaded || !session) {
      return;
    }

    const activeSession = session;
    const supabase = createClerkBrowserClient(() => activeSession.getToken());

    if (!supabase) {
      return;
    }

    const lobbySupabase = supabase;
    let active = true;

    async function refreshMembers() {
      const { data, error } = await lobbySupabase
        .from("game_members")
        .select("id, game_id, clerk_user_id, display_name, image_url, is_host, phase_done, phase_done_at, joined_at")
        .eq("game_id", initialSnapshot.game.id)
        .order("joined_at", { ascending: true })
        .returns<LobbyMember[]>();

      if (!active) {
        return;
      }

      if (error) {
        setStatus({ ok: false, error: error.message });
        return;
      }

      setMembers(data ?? []);
    }

    async function refreshClubs() {
      const { data, error } = await lobbySupabase
        .from("clubs")
        .select("id, game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, money, points, is_ready, image_url, created_at")
        .eq("game_id", initialSnapshot.game.id)
        .order("created_at", { ascending: true })
        .returns<LobbyClub[]>();

      if (!active) {
        return;
      }

      if (error) {
        setStatus({ ok: false, error: error.message });
        return;
      }

      setClubs(data ?? []);
    }

    async function subscribeToLobby() {
      const realtimeToken = await activeSession.getToken();

      if (!active) {
        return null;
      }

      if (!realtimeToken) {
        setStatus({ ok: false, error: "Realtime konnte kein Clerk-Token laden." });
        return null;
      }

      lobbySupabase.realtime.setAuth(realtimeToken);

      const channel = lobbySupabase
        .channel(`lobby:${initialSnapshot.game.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "games", filter: `id=eq.${initialSnapshot.game.id}` },
          (payload) => {
            if (payload.new) {
              setGame(payload.new as LobbyGame);
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "clubs", filter: `game_id=eq.${initialSnapshot.game.id}` },
          () => {
            void refreshMembers();
            void refreshClubs();
          },
        )
        .subscribe((realtimeStatus) => {
          if (realtimeStatus === "CHANNEL_ERROR") {
            setStatus({ ok: false, error: "Realtime-Verbindung konnte nicht aufgebaut werden." });
          }
        });

      return channel;
    }

    let channel: ReturnType<typeof lobbySupabase.channel> | null = null;

    void subscribeToLobby().then((nextChannel) => {
      channel = nextChannel;
    });
    void refreshMembers();
    void refreshClubs();

    return () => {
      active = false;
      if (channel) {
        void lobbySupabase.removeChannel(channel);
      }
    };
  }, [initialSnapshot.game.id, isLoaded, session]);

  useEffect(() => {
    if (game.phase !== "lobby") {
      router.push(`/games/${game.room_code}`);
    }
  }, [game.phase, game.room_code, router]);

  function toggleReady() {
    if (!ownClub) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const result = await setReadyAction(game.id, !ownClub.is_ready);
      setStatus(result);
    });
  }

  function startGame() {
    setStatus(null);
    startTransition(async () => {
      const result = await startGameAction(game.id);
      setStatus(result);
    });
  }

  function saveGame() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveGameAction(game.id);
      setStatus(result);
    });
  }

  return (
    <main
      className="min-h-screen px-4 py-6 text-zinc-100 sm:px-6 lg:px-8"
      style={
        {
          "--club-color": theme.color,
          "--club-rgb": theme.rgb,
          "--club-soft": theme.soft,
          "--club-border": theme.border,
          background:
            "radial-gradient(circle at 18% 0%, rgba(var(--club-rgb), 0.32), transparent 34rem), linear-gradient(135deg, var(--club-soft), #050609 62%)",
        } as CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="overflow-hidden rounded-lg border border-[var(--club-border)] bg-zinc-950/90 shadow-sm shadow-black/30">
          <div className="h-1.5 bg-[var(--club-color)]" />
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--club-color)] px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                {ownClub?.club_name ?? "Verein wird geladen"}
              </span>
              <Badge tone="green">Room {game.room_code}</Badge>
              <Badge>{game.phase.toUpperCase()}</Badge>
              <Badge>
                {readyCount}/{clubs.length} bereit
              </Badge>
              <Badge>Save v{game.save_version ?? 1}</Badge>
              <Badge tone={game.settings.continental_cup_enabled === false ? "neutral" : "blue"}>
                Continental Cup {game.settings.continental_cup_enabled === false ? "aus" : "an"}
              </Badge>
              <Badge tone={game.settings.sponsoring_enabled === false ? "neutral" : "blue"}>
                Sponsoring {game.settings.sponsoring_enabled === false ? "aus" : "an"}
              </Badge>
              <Badge tone={game.settings.archetypes_enabled === false ? "neutral" : "blue"}>
                Archetypes {game.settings.archetypes_enabled === false ? "aus" : "an"}
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-zinc-50">{ownClub?.club_name ?? "Lobby"}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {ownClub?.club_slogan ? `${ownClub.club_slogan} - ` : ""}
              {game.last_saved_at ? `Zuletzt gespeichert: ${formatSavedAt(game.last_saved_at)}` : "Spielstand angelegt"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => navigator.clipboard.writeText(game.room_code)}
              title="Room-Code kopieren"
              type="button"
              variant="secondary"
            >
              <Copy size={16} aria-hidden />
              Code
            </Button>
            {isHost ? (
              <Button disabled={isPending} onClick={saveGame} title="Spielstand speichern" type="button" variant="secondary">
                {isPending ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Save size={16} aria-hidden />}
                Speichern
              </Button>
            ) : null}
            {isHost ? (
              <Button
                className="text-white"
                disabled={!startState.ok || isPending}
                onClick={startGame}
                style={{ backgroundColor: theme.color }}
                title={startState.ok ? "Spiel starten" : startState.error}
                type="button"
              >
                {isPending ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                Start Game
              </Button>
            ) : null}
            <UserButton />
          </div>
          </div>
          {isHost ? (
            <div className="border-t border-zinc-800 px-4 py-3">
              <DevAdminMenu hostOnly isHost roomCode={game.room_code} variant="compact" />
            </div>
          ) : null}
        </header>

        {!supabaseConfigured ? (
          <div className="rounded-md border border-amber-800 bg-amber-950 px-4 py-3 text-sm text-amber-100">
            Supabase ist nicht konfiguriert. Bitte `.env.local` setzen, damit Realtime aktiv wird.
          </div>
        ) : null}

        {status && !status.ok ? (
          <div className="rounded-md border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-100">{status.error}</div>
        ) : null}

        {status?.ok && status.message ? (
          <div className="rounded-md border border-emerald-800 bg-emerald-950 px-4 py-3 text-sm text-emerald-100">{status.message}</div>
        ) : null}

        {isHost ? <DevAdminMenu hostOnly isHost roomCode={game.room_code} variant="panel" /> : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Panel className="border-[var(--club-border)] bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Clubs</PanelTitle>
                <PanelDescription>Realtime-Liste aller Manager in diesem Room.</PanelDescription>
              </div>
              <Users size={18} className="text-zinc-500" aria-hidden />
            </PanelHeader>
            <div className="grid gap-3 md:grid-cols-2">
              {clubs.map((club) => {
                const member = membersByClerkId[club.clerk_user_id];
                return (
                  <div
                    key={club.id}
                    className={cn(
                      "overflow-hidden rounded-md border bg-zinc-900/70",
                      club.clerk_user_id === currentUserId ? "border-[var(--club-color)]" : "border-zinc-800",
                    )}
                  >
                    <div className="h-1.5" style={{ backgroundColor: club.club_color ?? "#3f3f46" }} />
                    <div className="flex items-start justify-between gap-3 p-4">
                      <div className="flex min-w-0 gap-3">
                        <ClubBadge clubColor={club.club_color} clubName={club.club_name} size="md" />
                        <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-zinc-50">{club.club_name}</p>
                          {game.host_clerk_user_id === club.clerk_user_id ? (
                            <Badge tone="amber">
                              <Crown size={12} aria-hidden />
                              Host
                            </Badge>
                          ) : null}
                        </div>
                        {club.club_slogan ? <p className="mt-1 text-xs text-zinc-400">{club.club_slogan}</p> : null}
                        <p className="mt-1 text-sm text-zinc-500">{member?.display_name ?? club.manager_name}</p>
                        </div>
                      </div>
                      <Badge tone={club.is_ready ? "green" : "neutral"}>{club.is_ready ? "bereit" : "wartet"}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="border-[var(--club-border)] bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Dein Club</PanelTitle>
                <PanelDescription>Verein pruefen und Ready-Status toggeln.</PanelDescription>
              </div>
              {ownClub?.is_ready ? <Check size={18} className="text-[var(--club-color)]" aria-hidden /> : null}
            </PanelHeader>
            <div className="space-y-4">
              {ownClub ? (
                <div className="overflow-hidden rounded-md border border-[var(--club-border)] bg-zinc-900">
                  <div className="h-2" style={{ backgroundColor: ownClub.club_color ?? "#3f3f46" }} />
                  <div className="flex items-center gap-3 p-4">
                    <ClubBadge clubColor={ownClub.club_color} clubName={ownClub.club_name} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-50">{ownClub.club_name}</p>
                      {ownClub.club_slogan ? <p className="mt-1 text-sm text-zinc-400">{ownClub.club_slogan}</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}
              <Button
                className={cn("w-full", ownClub?.is_ready ? "" : "text-white")}
                disabled={isPending || !ownClub}
                onClick={toggleReady}
                style={ownClub?.is_ready ? undefined : { backgroundColor: theme.color }}
                type="button"
                variant={ownClub?.is_ready ? "outline" : "primary"}
              >
                {ownClub?.is_ready ? "Nicht bereit" : "Bereit"}
              </Button>
              {isHost && !startState.ok ? <p className="text-sm text-zinc-500">{startState.error}</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function formatSavedAt(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
