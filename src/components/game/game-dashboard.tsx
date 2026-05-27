"use client";

import { UserButton } from "@clerk/nextjs";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  ClipboardList,
  Crown,
  Dumbbell,
  Eye,
  Gavel,
  Home,
  ListOrdered,
  MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";
import {
  advancePhaseAction,
  deleteGameAction,
  buyScoutedPlayerAction,
  drawScoutingPlayerAction,
  finishScoutingTurnAction,
  initializeSeasonScheduleAction,
  initializeDeadlineDayAction,
  lockFixtureLineupAction,
  makeDraftPickAction,
  passDeadlineBidAction,
  passScoutedPlayerAction,
  placeDeadlineBidAction,
  resolveDeadlineAuctionAction,
  resolveFixtureAction,
  sellClubPlayerAction,
  setPhaseDoneAction,
  setReadyFromDashboardAction,
  startGameFromDashboardAction,
  syncScoutingTurnAction,
  trainPlayerAction,
  upgradeInvestmentAction,
} from "@/app/games/actions";
import { GameLineupBoard } from "@/components/game/game-lineup-board";
import { GameRealtimeRefresh } from "@/components/game/game-realtime-refresh";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { DEADLINE_BID_STEP, DEADLINE_TURN_SECONDS, getDeadlineActionLabel, getMinimumNextBid } from "@/lib/lobby/deadline";
import { mapDbPlayerToPlayerCardData } from "@/lib/lobby/draft";
import { canUpgradeFacility, getUpgradeCost, getUpgradeReasonLabel, type UpgradeAction } from "@/lib/lobby/investments";
import { calculateLineupPower } from "@/lib/lobby/lineup-power";
import { isInvestmentPhase } from "@/lib/lobby/phases";
import { canStartLobby } from "@/lib/lobby/rules";
import {
  canBuyScoutedPlayer,
  canDrawScoutingPlayer,
  canResolveScoutedPlayer,
  canSellClubPlayer,
  getScoutingActionLabel,
  isOffseasonPhase,
  SCOUTING_PILES,
} from "@/lib/lobby/scouting";
import { getClubTheme } from "@/lib/lobby/theme";
import { canTrainOwnedPlayer, getTrainingReasonLabel } from "@/lib/lobby/training";
import type { DraftPlayerRow, LobbyClub, LobbySnapshot, SeasonFixtureSnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";
import { getPositionLabel, type PlayerCardData, type PlayerCardPosition } from "@/types/player-card";

type GameView =
  | "dashboard"
  | "squad"
  | "grounds"
  | "lineup"
  | "matchday"
  | "table"
  | "transfer"
  | "settings"
  | "draft"
  | "training"
  | "scouting"
  | "deadline";

type GameDashboardProps = {
  activeView?: string;
  currentUserId: string;
  snapshot: LobbySnapshot;
};

type LineupPowerSummary = {
  ATT: { base: number; chemistry: number; total: number };
  DEF: { base: number; chemistry: number; total: number };
  MID: { base: number; chemistry: number; total: number };
};

const mainMenu: Array<{ id: GameView; label: string; icon: typeof Home }> = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "squad", label: "Kaderuebersicht", icon: Users },
  { id: "grounds", label: "Vereinsgelaende", icon: Building2 },
  { id: "lineup", label: "Aufstellung", icon: Shield },
  { id: "matchday", label: "Spieltagsuebersicht", icon: CalendarDays },
  { id: "transfer", label: "Transfermarkt", icon: ShoppingCart },
  { id: "table", label: "Tabelle", icon: Trophy },
  { id: "settings", label: "Settings", icon: Settings },
];

const phaseMenu: Array<{ id: GameView; label: string; icon: typeof Home; phases: string[] }> = [
  { id: "draft", label: "Draft", icon: ClipboardList, phases: ["draft"] },
  { id: "training", label: "Training", icon: Dumbbell, phases: ["offseason_training"] },
  { id: "scouting", label: "Scouting", icon: MapIcon, phases: ["offseason_scouting"] },
  { id: "deadline", label: "Deadline Day", icon: Gavel, phases: ["deadline_day"] },
];

export function GameDashboard({ activeView, currentUserId, snapshot }: GameDashboardProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const view = normalizeView(activeView);
  const ownClub = snapshot.clubs.find((club) => club.clerk_user_id === currentUserId);
  const theme = getClubTheme(ownClub);
  const isHost = snapshot.game.host_clerk_user_id === currentUserId;
  const startState = canStartLobby(snapshot.game, snapshot.clubs, currentUserId);
  const currentTurnClub = snapshot.clubs.find((club) => club.id === snapshot.game.current_turn_club_id);
  const ownMember = snapshot.members.find((member) => member.clerk_user_id === currentUserId);
  const phaseDoneCount =
    snapshot.game.phase === "lobby"
      ? snapshot.clubs.filter((club) => club.is_ready).length
      : snapshot.members.filter((member) => member.phase_done).length;
  const phaseDoneTotal = snapshot.game.phase === "lobby" ? snapshot.clubs.length : snapshot.members.length;
  const allPhaseDone = snapshot.game.phase === "lobby" ? startState.ok : phaseDoneTotal > 0 && phaseDoneCount === phaseDoneTotal;

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
      <GameRealtimeRefresh gameId={snapshot.game.id} />
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1480px] gap-5 transition-[grid-template-columns]",
          sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[270px_minmax(0,1fr)]",
        )}
      >
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <AppSidebar
            activeView={view}
            collapsed={sidebarCollapsed}
            isHost={isHost}
            onToggle={() => setSidebarCollapsed((value) => !value)}
            snapshot={snapshot}
          />
        </aside>

        <section className="min-w-0 space-y-5">
          <GameHeader
            currentTurnClub={currentTurnClub}
            allPhaseDone={allPhaseDone}
            isHost={isHost}
            ownClub={ownClub}
            ownMember={ownMember}
            phaseDoneCount={phaseDoneCount}
            phaseDoneTotal={phaseDoneTotal}
            snapshot={snapshot}
            startState={startState}
          />
          {renderView(view, {
            currentTurnClub,
            isHost,
            ownClub,
            snapshot,
          })}
        </section>
      </div>
    </main>
  );
}

function AppSidebar({
  activeView,
  collapsed,
  isHost,
  onToggle,
  snapshot,
}: {
  activeView: GameView;
  collapsed: boolean;
  isHost: boolean;
  onToggle: () => void;
  snapshot: LobbySnapshot;
}) {
  return (
    <nav className="overflow-hidden rounded-lg border border-[var(--club-border)] bg-zinc-950/90 shadow-sm shadow-black/30">
      <div className="h-1.5 bg-[var(--club-color)]" />
      <div className="p-4">
        <div className={cn("flex items-start justify-between gap-2", collapsed ? "justify-center" : "")}>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-zinc-500">Superclub</p>
              <p className="mt-1 truncate text-lg font-semibold text-zinc-50">Room {snapshot.game.room_code}</p>
            </div>
          ) : null}
          <Button
            aria-label={collapsed ? "Menue ausklappen" : "Menue einklappen"}
            onClick={onToggle}
            size="icon"
            title={collapsed ? "Menue ausklappen" : "Menue einklappen"}
            type="button"
            variant="ghost"
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </Button>
        </div>

        <div className="mt-5 space-y-1">
          {mainMenu.map((item) => (
            <MenuLink active={activeView === item.id} collapsed={collapsed} game={snapshot.game.room_code} item={item} key={item.id} />
          ))}
        </div>

        <div className="mt-5 border-t border-zinc-800 pt-4">
          {!collapsed ? <p className="px-2 text-xs font-medium uppercase text-zinc-500">Sonderphasen</p> : null}
          <div className="mt-2 space-y-1">
            {phaseMenu.map((item) => (
              <MenuLink
                active={activeView === item.id}
                badge={item.phases.includes(snapshot.game.phase) ? "aktiv" : undefined}
                collapsed={collapsed}
                game={snapshot.game.room_code}
                item={item}
                key={item.id}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-800 pt-4">
          {collapsed ? (
            <div className="flex justify-center">
              <Badge>{snapshot.game.phase.slice(0, 2)}</Badge>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-900/70 px-3 py-2 text-sm">
                <span className="text-zinc-400">Phase</span>
                <Badge>{snapshot.game.phase}</Badge>
              </div>
              {isHost ? <p className="mt-3 px-2 text-xs text-zinc-500">Host-Tools sind oben rechts verfuegbar.</p> : null}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function MenuLink({
  active,
  badge,
  collapsed,
  game,
  item,
}: {
  active: boolean;
  badge?: string;
  collapsed: boolean;
  game: string;
  item: { id: GameView; label: string; icon: typeof Home };
}) {
  const Icon = item.icon;

  return (
    <Link
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
        collapsed ? "justify-center px-0" : "justify-between",
        active ? "bg-[var(--club-color)] text-white" : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50",
      )}
      href={`/games/${game}?view=${item.id}`}
      title={collapsed ? item.label : undefined}
    >
      <span className={cn("flex min-w-0 items-center gap-2", collapsed ? "justify-center" : "")}>
        <Icon size={16} aria-hidden />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </span>
      {badge && !collapsed ? <span className="text-[11px] opacity-80">{badge}</span> : null}
    </Link>
  );
}

function GameHeader({
  allPhaseDone,
  currentTurnClub,
  isHost,
  ownClub,
  ownMember,
  phaseDoneCount,
  phaseDoneTotal,
  snapshot,
  startState,
}: {
  allPhaseDone: boolean;
  currentTurnClub: LobbyClub | undefined;
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  ownMember: LobbySnapshot["members"][number] | undefined;
  phaseDoneCount: number;
  phaseDoneTotal: number;
  snapshot: LobbySnapshot;
  startState: ReturnType<typeof canStartLobby>;
}) {
  return (
    <header className="overflow-hidden rounded-lg border border-[var(--club-border)] bg-zinc-950/90 shadow-sm shadow-black/30">
      <div className="h-1.5 bg-[var(--club-color)]" />
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--club-color)] px-2.5 py-1 text-xs font-medium text-white shadow-sm">
              {ownClub?.club_name ?? "Verein wird geladen"}
            </span>
            <Badge tone="green">Room {snapshot.game.room_code}</Badge>
            <Badge>{snapshot.game.phase.toUpperCase()}</Badge>
            <Badge>{phaseDoneCount}/{phaseDoneTotal} fertig</Badge>
            <Badge>Save v{snapshot.game.save_version ?? 1}</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-50">{ownClub?.club_name ?? "Spielstand"}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {ownClub?.club_slogan ? `${ownClub.club_slogan} - ` : ""}
            {currentTurnClub ? `${currentTurnClub.club_name} ist am Zug` : formatSavedLine(snapshot.game.last_saved_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
            href="/lobby"
          >
            <ArrowLeft size={16} aria-hidden />
            Savegames
          </Link>
          {snapshot.game.phase === "lobby" && ownClub ? (
            <form action={setReadyFromDashboardAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="ready" type="hidden" value={ownClub.is_ready ? "false" : "true"} />
              <Button type="submit" variant={ownClub.is_ready ? "outline" : "primary"}>
                {ownClub.is_ready ? "Nicht fertig" : "Fertig"}
              </Button>
            </form>
          ) : null}
          {snapshot.game.phase === "lobby" && isHost ? (
            <form action={startGameFromDashboardAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <Button disabled={!startState.ok} title={startState.ok ? "Runde fortsetzen" : startState.error} type="submit">
                <Play size={16} aria-hidden />
                Fortsetzen
              </Button>
            </form>
          ) : null}
          {snapshot.game.phase !== "lobby" && ownMember ? (
            <form action={setPhaseDoneAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="done" type="hidden" value={ownMember.phase_done ? "false" : "true"} />
              <Button type="submit" variant={ownMember.phase_done ? "outline" : "primary"}>
                {ownMember.phase_done ? "Nicht fertig" : "Fertig"}
              </Button>
            </form>
          ) : null}
          {snapshot.game.phase !== "lobby" && isHost ? (
            <form action={advancePhaseAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <Button disabled={!allPhaseDone} title={allPhaseDone ? "Runde fortsetzen" : "Alle Manager muessen fertig sein."} type="submit">
                <Play size={16} aria-hidden />
                Fortsetzen
              </Button>
            </form>
          ) : null}
          <UserButton />
        </div>
      </div>
    </header>
  );
}

function DashboardView({
  currentTurnClub,
  isHost,
  ownClub,
  snapshot,
}: {
  currentTurnClub: LobbyClub | undefined;
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const readyCount = snapshot.clubs.filter((club) => club.is_ready).length;

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Dashboard</PanelTitle>
            <PanelDescription>Basisinformationen zum aktuellen Spielstand.</PanelDescription>
          </div>
          <Crown size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric icon={Users} label="Manager" value={String(snapshot.clubs.length)} detail={`${readyCount}/${snapshot.clubs.length} bereit`} />
          <Metric icon={Banknote} label="Budget" value={formatMoney(ownClub?.money ?? 0)} detail="aktueller Verein" />
          <Metric icon={Sparkles} label="Staerkelevel" value={`${formatStars(ownClub?.squad_stars ?? 0)} Sterne`} detail="gesamter Kader" />
          <Metric icon={Target} label="Positionierung" value={`#${ownClub?.season_rank ?? 1}`} detail={getClubStatusLabel(ownClub?.status)} />
          <Metric icon={ListOrdered} label="Am Zug" value={currentTurnClub?.club_name ?? getTurnFallback(snapshot.game.phase, isHost)} detail={snapshot.game.phase} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Aktueller Spielstand</PanelTitle>
              <PanelDescription>Room, Phase und naechste Schritte.</PanelDescription>
            </div>
            <CalendarDays size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Room", snapshot.game.room_code],
              ["Phase", snapshot.game.phase],
              ["Save", `v${snapshot.game.save_version ?? 1}`],
              ["Status", snapshot.game.save_status ?? "active"],
            ].map(([label, value]) => (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={label}>
                <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
        <ClubSummaryPanel ownClub={ownClub} />
      </div>

      <ManagersPanel snapshot={snapshot} />
    </div>
  );
}

function ClubSummaryPanel({ ownClub }: { ownClub: LobbyClub | undefined }) {
  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>Dein Verein</PanelTitle>
          <PanelDescription>Theme und Basisdaten.</PanelDescription>
        </div>
        <Crown size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      {ownClub ? (
        <div className="overflow-hidden rounded-md border border-[var(--club-border)] bg-zinc-900">
          <div className="h-2 bg-[var(--club-color)]" />
          <div className="p-4">
            <p className="font-semibold text-zinc-50">{ownClub.club_name}</p>
            {ownClub.club_slogan ? <p className="mt-1 text-sm text-zinc-400">{ownClub.club_slogan}</p> : null}
            <p className="mt-3 text-xs text-zinc-500">Budget {formatMoney(ownClub.money)}</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ManagersPanel({ snapshot }: { snapshot: LobbySnapshot }) {
  const memberByClerkId = new Map(snapshot.members.map((member) => [member.clerk_user_id, member]));

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85 xl:col-span-2">
      <PanelHeader>
        <div>
          <PanelTitle>Manager</PanelTitle>
          <PanelDescription>Alle Clubs in diesem Spielstand.</PanelDescription>
        </div>
        <Users size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.clubs.map((club) => (
          <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/70" key={club.id}>
            <div className="h-1.5" style={{ backgroundColor: club.club_color ?? "#3f3f46" }} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-50">{club.club_name}</p>
                  {club.club_slogan ? <p className="mt-1 text-xs text-zinc-400">{club.club_slogan}</p> : null}
                </div>
                <Badge tone={getManagerDone(club, memberByClerkId)?.done ? "green" : "neutral"}>
                  {getManagerDone(club, memberByClerkId)?.label}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-zinc-500">{club.manager_name}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function getManagerDone(club: LobbyClub, memberByClerkId: Map<string, LobbySnapshot["members"][number]>) {
  const member = memberByClerkId.get(club.clerk_user_id);

  return {
    done: member?.phase_done ?? club.is_ready,
    label: member?.phase_done || club.is_ready ? "fertig" : "wartet",
  };
}

function DraftView({ ownClub, snapshot }: { ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const draft = snapshot.draft;

  if (!draft) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Draft</PanelTitle>
            <PanelDescription>Das Draftboard wird vorbereitet.</PanelDescription>
          </div>
          <ClipboardList size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300">
          Starte das Spiel aus der Lobby heraus. Danach erzeugt der Server automatisch ein Board mit 16 Spielern.
        </div>
      </Panel>
    );
  }

  const currentTurnClub = snapshot.clubs.find((club) => club.id === draft.current_club_id);
  const pickedPlayerIds = new Set(draft.picks.map((pick) => pick.playerId));
  const isMyTurn = Boolean(ownClub && draft.current_club_id === ownClub.id && snapshot.game.current_turn_club_id === ownClub.id);
  const ownSquadCount = ownClub ? draft.squad_counts[ownClub.id] ?? 0 : 0;
  const playerNames = new Map(draft.board_players.map((player) => [player.id, player.display_name]));
  const clubNames = new Map(snapshot.clubs.map((club) => [club.id, club.club_name]));

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Draft Board</PanelTitle>
            <PanelDescription>
              Runde {draft.round_index + 1} - Pick {Math.min(draft.current_pick_index + 1, 16)} von 16
            </PanelDescription>
          </div>
          <Badge tone="green">{draft.picks.length}/16 Picks</Badge>
        </PanelHeader>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            detail={isMyTurn ? "Du kannst jetzt picken" : "wartet auf Manager"}
            icon={ListOrdered}
            label="Am Zug"
            value={currentTurnClub?.club_name ?? "Draft abgeschlossen"}
          />
          <Metric detail="eigener Kader" icon={Users} label="Kader" value={`${ownSquadCount}/16`} />
          <Metric
            detail="Lobby-Einstellung"
            icon={Sparkles}
            label="Boardlimit"
            value={`Max ${snapshot.game.settings.max_draft_stars} Sterne`}
          />
          <Metric detail="rotierende Reihenfolge" icon={ClipboardList} label="Runde" value={String(draft.round_index + 1)} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Verfuegbare Spieler</PanelTitle>
              <PanelDescription>
                {isMyTurn ? "Waehle eine Karte fuer deinen Kader." : `Wartet auf ${currentTurnClub?.club_name ?? "den naechsten Pick"}.`}
              </PanelDescription>
            </div>
            <ClipboardList size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {draft.board_players.map((player) => {
              const card = mapDbPlayerToPlayerCardData(player);
              const picked = pickedPlayerIds.has(player.id);
              const canPick = isMyTurn && !picked;

              return (
                <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900/45 p-2", picked ? "opacity-55" : "")} key={player.id}>
                  <PlayerCard disabled={picked} player={card} variant="draft" />
                  <form action={makeDraftPickAction} className="mt-2">
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="club_id" type="hidden" value={ownClub?.id ?? ""} />
                    <input name="player_id" type="hidden" value={player.id} />
                    <Button className="w-full" disabled={!canPick} type="submit" variant={canPick ? "primary" : "outline"}>
                      {picked ? "Gedraftet" : canPick ? "Draften" : "Nicht am Zug"}
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Pick-Historie</PanelTitle>
              <PanelDescription>Aktuelle Runde, neueste Picks unten.</PanelDescription>
            </div>
            <ListOrdered size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="space-y-2">
            {draft.picks.length === 0 ? (
              <p className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-400">Noch kein Pick in dieser Runde.</p>
            ) : (
              draft.picks.map((pick) => (
                <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={`${pick.clubId}-${pick.playerId}`}>
                  <p className="text-xs font-medium uppercase text-zinc-500">Pick {pick.pickIndex + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{playerNames.get(pick.playerId) ?? "Spieler"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{clubNames.get(pick.clubId) ?? "Club"}</p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TrainingView({
  isHost,
  ownClub,
  snapshot,
}: {
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const [testMode, setTestMode] = useState(false);
  const overview = snapshot.club_overview;

  if (!ownClub || !overview) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Training</PanelTitle>
            <PanelDescription>Clubdaten werden geladen.</PanelDescription>
          </div>
          <Dumbbell size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  const status = overview.training.status;
  const trainingEnabled = snapshot.game.phase === "offseason_training" || (isHost && testMode);
  const trainedClubPlayerIds = new Set(overview.training.events.map((event) => event.club_player_id));
  const latestEvents = [...overview.training.events].slice(0, 8);
  const diceCounts = [1, 2, 3, 4, 5, 6].map((roll) => ({
    count: overview.training.events.filter((event) => event.dice_roll === roll).length,
    roll,
  }));

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Trainingszentrum</PanelTitle>
            <PanelDescription>
              1W6 je Spieler: Wurf wird zum neuen Level, begrenzt durch Trainingslevel und Spielermaximum.
            </PanelDescription>
          </div>
          <Dumbbell size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric detail="Vereinsgelaende" icon={Building2} label="Training Level" value={`${status.training_level}/4`} />
          <Metric detail="Spieler pro Trainingsphase" icon={Users} label="Kapazitaet" value={`${status.attempts_used}/${status.capacity_players}`} />
          <Metric detail="Cap pro Spieler in dieser Phase" icon={Sparkles} label="Max Steigerung" value={`+${status.max_gain_per_player}`} />
          <Metric
            detail={status.training_level >= 4 ? "Level-4-Regel" : "ab Level 4"}
            icon={Crown}
            label="Garantierter Stern"
            value={status.guaranteed_bonus_available ? "verfuegbar" : status.guaranteed_bonus_used ? "genutzt" : "nein"}
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              {trainingEnabled ? "Training ist aktiv" : "Training ist in dieser Phase gesperrt"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Regulär aktiv in `offseason_training`. Host-Testmodus erlaubt Smoke-Tests im aktuellen Spielstand.
            </p>
          </div>
          {isHost ? (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              <input
                checked={testMode}
                className="h-4 w-4 accent-lime-300"
                onChange={(event) => setTestMode(event.target.checked)}
                type="checkbox"
              />
              Testmodus
            </label>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Kadertraining</PanelTitle>
              <PanelDescription>Trainiere jeden Spieler hoechstens einmal in dieser Trainingsphase.</PanelDescription>
            </div>
            <Sparkles size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          {overview.squad.length === 0 ? (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
              Noch keine Spieler im Kader. Nach dem Draft kannst du hier trainieren.
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
              {overview.squad.map((owned) => {
                const card = mapOwnedPlayerToCardData(owned);
                const currentStars = Math.trunc(Number(owned.current_stars));
                const skillMax = Math.trunc(Number(owned.player.skill_max ?? card.skill.max));
                const check = canTrainOwnedPlayer({
                  alreadyTrained: trainedClubPlayerIds.has(owned.id),
                  attemptsUsed: status.attempts_used,
                  capacityPlayers: status.capacity_players,
                  currentStars,
                  injured: owned.injured,
                  skillMax,
                });
                const canTrain = trainingEnabled && check.ok;

                return (
                  <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900/45 p-2", trainedClubPlayerIds.has(owned.id) ? "ring-1 ring-lime-300/40" : "")} key={owned.id}>
                    <PlayerCard disabled={owned.injured} player={card} variant="draft" />
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                      <SmallInfo label="Aktuell" value={`${currentStars} Sterne`} />
                      <SmallInfo label="Maximum" value={`${skillMax} Sterne`} />
                    </div>
                    <form action={trainPlayerAction} className="mt-2">
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="club_player_id" type="hidden" value={owned.id} />
                      <input name="allow_test_mode" type="hidden" value={testMode ? "true" : "false"} />
                      <Button className="w-full" disabled={!canTrain} title={canTrain ? "1W6 Training ausloesen" : getTrainingDisabledLabel(trainingEnabled, check)} type="submit" variant={canTrain ? "primary" : "outline"}>
                        {canTrain ? "Trainieren" : getTrainingDisabledLabel(trainingEnabled, check)}
                      </Button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Trainingslog</PanelTitle>
              <PanelDescription>Neueste Wuerfelproben in dieser Phase.</PanelDescription>
            </div>
            <ListOrdered size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="space-y-2">
            {latestEvents.length === 0 ? (
              <p className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-400">Noch kein Training in dieser Phase.</p>
            ) : (
              latestEvents.map((event) => {
                const owned = overview.squad.find((player) => player.id === event.club_player_id);

                return (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={event.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{owned?.player.display_name ?? "Spieler"}</p>
                        <p className="mt-1 text-xs text-zinc-500">{formatSavedAt(event.created_at)}</p>
                      </div>
                      <Badge tone={event.success ? "green" : "red"}>Wurf {event.dice_roll}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">
                      {formatStars(event.before_stars)} {"->"} {formatStars(event.after_stars)} Sterne
                      {event.guaranteed_bonus_used ? " inkl. Bonus" : ""}
                    </p>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
            <p className="text-xs font-medium uppercase text-zinc-500">Wuerfelverteilung</p>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {diceCounts.map((item) => (
                <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-center" key={item.roll}>
                  <p className="text-sm font-black text-zinc-50">{item.roll}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{item.count}x</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              Jeder Wurf hat 16,7 Prozent. Fortschritt entsteht nur, wenn der Wurf ueber dem aktuellen Sternwert liegt und weder Skill-Max noch Trainingscap blockieren.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ScoutingView({ isHost, ownClub, snapshot }: { isHost: boolean; ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const scouting = snapshot.scouting;
  const overview = snapshot.club_overview;

  if (!ownClub || !overview || !scouting) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Scouting</PanelTitle>
            <PanelDescription>Scoutingdaten werden vorbereitet.</PanelDescription>
          </div>
          <MapIcon size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
          Scouting ist aktiv, sobald die Phase `offseason_scouting` erreicht ist.
        </div>
      </Panel>
    );
  }

  const ownStatus = scouting.status_by_club_id[ownClub.id];
  const currentClub = snapshot.clubs.find((club) => club.id === scouting.current_club_id);
  const nextPendingClub = snapshot.clubs.find((club) => club.id === scouting.next_pending_club_id);
  const isMyTurn = scouting.current_club_id === ownClub.id;
  const needsTurnSync = !scouting.current_club_id && !scouting.all_finished;
  const ownDraws = scouting.draws.filter((draw) => draw.club_id === ownClub.id);
  const ownOpenDraws = ownDraws.filter((draw) => draw.status === "drawn");
  const allOwnCardsDrawn = ownStatus.draw_count >= ownStatus.capacity;
  const canFinish = isMyTurn && allOwnCardsDrawn && ownOpenDraws.length === 0;
  const turnLabel = currentClub?.club_name ?? (scouting.all_finished ? "Scouting fertig" : nextPendingClub?.club_name ?? "Turn offen");
  const waitDescription = needsTurnSync
    ? isHost
      ? "Der Scouting-Zug muss synchronisiert werden."
      : "Wartet auf die Scouting-Synchronisierung durch den Host."
    : `Wartet auf ${turnLabel}.`;

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Scouting Network</PanelTitle>
            <PanelDescription>Ziehe Karten aus den Welt-Stapeln und kaufe danach aus deiner Auslage.</PanelDescription>
          </div>
          <MapIcon size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric detail={isMyTurn ? "Du scoutest gerade" : needsTurnSync ? "Sync erforderlich" : "wartet"} icon={ListOrdered} label="Am Zug" value={turnLabel} />
          <Metric detail="Vereinsgelaende" icon={Eye} label="Scouting Level" value={`${ownClub.scouting_level ?? 1}/4`} />
          <Metric detail="eigene Ziehungen" icon={ClipboardList} label="Gezogen" value={`${ownStatus.draw_count}/${ownStatus.capacity}`} />
          <Metric detail="offene Entscheidungen" icon={ShoppingCart} label="Auslage" value={`${ownOpenDraws.length}`} />
          <Metric detail="im Transfermarkt" icon={UserMinus} label="Verkaeufe" value={`${ownStatus.sales_count}/2`} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel className="overflow-hidden border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>The World of Scouting</PanelTitle>
              <PanelDescription>{isMyTurn ? "Waehle einen Stapel fuer die naechste Karte." : waitDescription}</PanelDescription>
            </div>
            <Badge tone={isMyTurn ? "green" : "neutral"}>{ownStatus.draw_count}/{ownStatus.capacity}</Badge>
          </PanelHeader>
          {needsTurnSync ? (
            <div className="mb-3 rounded-md border border-amber-800 bg-amber-950/40 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-100">Scouting-Turn fehlt</p>
                  <p className="mt-1 text-xs text-amber-200/75">
                    {isHost
                      ? `Naechster offener Club: ${nextPendingClub?.club_name ?? "noch offen"}.`
                      : "Der Host kann den aktuellen Scouting-Zug neu setzen."}
                  </p>
                </div>
                {isHost ? (
                  <form action={syncScoutingTurnAction}>
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <Button type="submit" variant="secondary">
                      <ListOrdered size={16} aria-hidden />
                      Scouting synchronisieren
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="relative overflow-hidden rounded-lg border border-emerald-900/70 bg-[radial-gradient(circle_at_50%_45%,rgba(16,185,129,0.20),transparent_21rem),linear-gradient(135deg,#07110d,#071522_58%,#050609)] p-4">
            <div className="pointer-events-none absolute left-[16%] top-[28%] h-20 w-32 rounded-full border border-emerald-500/20 bg-emerald-400/5 blur-sm" />
            <div className="pointer-events-none absolute right-[18%] top-[42%] h-28 w-36 rounded-full border border-sky-500/20 bg-sky-400/5 blur-sm" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SCOUTING_PILES.map((pile, index) => {
                const drawCheck = canDrawScoutingPlayer({
                  currentTurnClubId: scouting.current_club_id,
                  drawnCount: ownStatus.draw_count,
                  ownClubId: ownClub.id,
                  scoutingCapacity: ownStatus.capacity,
                });
                const canDraw = drawCheck.ok;

                return (
                  <form action={drawScoutingPlayerAction} key={pile.key}>
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="club_id" type="hidden" value={ownClub.id} />
                    <input name="pile_key" type="hidden" value={pile.key} />
                    <button
                      className={cn(
                        "group relative h-36 w-full overflow-hidden rounded-lg border border-sky-800/70 bg-slate-950/80 p-4 text-left shadow-lg transition",
                        canDraw ? "hover:-translate-y-0.5 hover:border-lime-300/80 hover:bg-slate-900" : "opacity-55",
                      )}
                      disabled={!canDraw}
                      title={canDraw ? "Spieler scouten" : getScoutingCheckLabel(drawCheck)}
                      type="submit"
                    >
                      <span className="absolute right-4 top-4 rounded-md border border-sky-700 bg-sky-950 px-2 py-1 text-xs font-semibold text-sky-100">
                        Stapel {index + 1}
                      </span>
                      <span className="mt-12 block text-lg font-black text-zinc-50">{pile.label}</span>
                      <span className="mt-1 block text-xs text-zinc-500">Random Player Base</span>
                      <span className="absolute bottom-4 left-4 right-4 h-2 rounded-full bg-sky-950">
                        <span className="block h-2 rounded-full bg-lime-300 transition group-hover:w-full" style={{ width: canDraw ? "58%" : "20%" }} />
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Scouting-Zug</PanelTitle>
              <PanelDescription>Erst ziehen, dann kaufen oder passen.</PanelDescription>
            </div>
            <ListOrdered size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="space-y-3">
            {snapshot.clubs.map((club) => {
              const status = scouting.status_by_club_id[club.id];

              return (
                <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={club.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-100">{club.club_name}</p>
                    <Badge tone={scouting.current_club_id === club.id ? "green" : status?.finished ? "blue" : "neutral"}>
                      {scouting.current_club_id === club.id ? "am Zug" : status?.finished ? "fertig" : "wartet"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {status?.draw_count ?? 0}/{status?.capacity ?? 0} gezogen, {status?.bought_count ?? 0} gekauft
                  </p>
                </div>
              );
            })}
            <form action={finishScoutingTurnAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <Button className="w-full" disabled={!canFinish} type="submit">
                Scouting-Zug beenden
              </Button>
            </form>
          </div>
        </Panel>
      </div>

      <ScoutingDrawsPanel ownClub={ownClub} overview={overview} scouting={scouting} snapshot={snapshot} />
    </div>
  );
}

function ScoutingDrawsPanel({
  ownClub,
  overview,
  scouting,
  snapshot,
}: {
  ownClub: LobbyClub;
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  scouting: NonNullable<LobbySnapshot["scouting"]>;
  snapshot: LobbySnapshot;
}) {
  const clubNames = new Map(snapshot.clubs.map((club) => [club.id, club.club_name]));
  const ownStatus = scouting.status_by_club_id[ownClub.id];
  const ownDraws = scouting.draws.filter((draw) => draw.club_id === ownClub.id);
  const allOwnCardsDrawn = ownStatus.draw_count >= ownStatus.capacity;

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>Scouting-Auslagen</PanelTitle>
          <PanelDescription>Alle Manager sehen die gescouteten Spieler.</PanelDescription>
        </div>
        <Eye size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      {scouting.draws.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">Noch keine Spieler gescoutet.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {scouting.draws.map((draw) => {
            const card = mapDbPlayerToPlayerCardData(draw.player);
            const isOwnDraw = draw.club_id === ownClub.id;
            const buyCheck = canBuyScoutedPlayer({
              currentTurnClubId: scouting.current_club_id,
              drawnCount: ownDraws.length,
              money: overview.finance.money,
              ownClubId: ownClub.id,
              playerPrice: Number(draw.player.scouting_price ?? 0),
              scoutingCapacity: ownStatus.capacity,
              squadSize: overview.squad.length,
            });
            const resolveCheck = canResolveScoutedPlayer({
              currentTurnClubId: scouting.current_club_id,
              drawnCount: ownDraws.length,
              ownClubId: ownClub.id,
              scoutingCapacity: ownStatus.capacity,
            });
            const canBuy = isOwnDraw && draw.status === "drawn" && buyCheck.ok;
            const canPass = isOwnDraw && draw.status === "drawn" && resolveCheck.ok;

            return (
              <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900/45 p-2", draw.status !== "drawn" ? "opacity-60" : "")} key={draw.id}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge tone={draw.status === "bought" ? "green" : draw.status === "passed" ? "red" : "blue"}>{draw.status}</Badge>
                  <span className="truncate text-xs text-zinc-500">{clubNames.get(draw.club_id) ?? "Club"}</span>
                </div>
                <PlayerCard disabled={draw.status !== "drawn"} player={card} variant="draft" />
                {isOwnDraw && draw.status === "drawn" ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <form action={buyScoutedPlayerAction}>
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="draw_id" type="hidden" value={draw.id} />
                      <Button className="w-full" disabled={!canBuy} size="sm" title={canBuy ? "Spieler kaufen" : getScoutingCheckLabel(buyCheck)} type="submit">
                        <ShoppingCart size={14} aria-hidden />
                        Kaufen
                      </Button>
                    </form>
                    <form action={passScoutedPlayerAction}>
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="draw_id" type="hidden" value={draw.id} />
                      <Button className="w-full" disabled={!canPass || !allOwnCardsDrawn} size="sm" type="submit" variant="outline">
                        <X size={14} aria-hidden />
                        Passen
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function TransferMarketView({ ownClub, snapshot }: { ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const overview = snapshot.club_overview;

  if (!ownClub || !overview) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Transfermarkt</PanelTitle>
            <PanelDescription>Transferdaten werden geladen.</PanelDescription>
          </div>
          <ShoppingCart size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  const salesCount = overview.sales_count;
  const isOffseason = isOffseasonPhase(snapshot.game.phase);
  const saleCheck = canSellClubPlayer({ isOffseason, salesCount });

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Transfermarkt</PanelTitle>
            <PanelDescription>Verkaufe Spieler aus deinem Kader und bereite spaetere Angebote zwischen Clubs vor.</PanelDescription>
          </div>
          <ShoppingCart size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric detail="aktueller Kontostand" icon={Banknote} label="Budget" value={formatMoney(overview.finance.money)} />
          <Metric detail="Offseason-Limit" icon={UserMinus} label="Verkaeufe" value={`${salesCount}/2`} />
          <Metric detail={isOffseason ? "Verkauf aktiv" : "nur in der Offseason"} icon={CalendarDays} label="Phase" value={snapshot.game.phase} />
        </div>
      </Panel>

      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Eigener Kader</PanelTitle>
            <PanelDescription>Position, Staerke und Marktwerte sind direkt an den Spielstand gekoppelt.</PanelDescription>
          </div>
          <Users size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone={saleCheck.ok ? "green" : "red"}>{saleCheck.ok ? "Verkauf moeglich" : getScoutingCheckLabel(saleCheck)}</Badge>
          <Badge>{overview.squad.length} Spieler</Badge>
        </div>
        {overview.squad.length === 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">Keine Spieler im Kader.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.squad.map((owned) => {
              const card = mapOwnedPlayerToCardData(owned);
              const positionLabel = getPlayerPositionLabel(owned.player);
              const currentStars = Number(owned.current_stars);
              const maxStars = Number(owned.player.skill_max ?? card.skill.max);

              return (
                <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/55 p-3 sm:grid-cols-[132px_minmax(0,1fr)]" key={owned.id}>
                  <PlayerCard disabled={owned.injured} player={card} variant="draft" />
                  <div className="flex min-w-0 flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-zinc-50">{owned.player.display_name}</p>
                          <p className="mt-1 text-sm text-zinc-400">{positionLabel}</p>
                        </div>
                        <Badge tone={owned.injured ? "red" : "green"}>{owned.injured ? "verletzt" : "fit"}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                        <SmallInfo label="Staerke" value={`${formatStars(currentStars)} / ${formatStars(maxStars)}`} />
                        <SmallInfo label="Zone" value={owned.current_zone} />
                        <SmallInfo label="Transfer Value" value={formatMoney(Number(owned.player.minimum_bid ?? 0))} />
                        <SmallInfo label="Scouting Value" value={formatMoney(Number(owned.player.scouting_price ?? 0))} />
                      </div>
                    </div>
                    <form action={sellClubPlayerAction}>
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="club_player_id" type="hidden" value={owned.id} />
                      <input name="return_view" type="hidden" value="transfer" />
                      <Button disabled={!saleCheck.ok} size="sm" type="submit" variant="outline">
                        <UserMinus size={14} aria-hidden />
                        Spieler verkaufen
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="border-zinc-800 bg-zinc-950/75">
          <PanelHeader>
            <div>
              <PanelTitle>Eingehende Angebote</PanelTitle>
              <PanelDescription>Annehmen oder ablehnen kommt in der naechsten Transfer-Ausbaustufe.</PanelDescription>
            </div>
            <Gavel size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
            Noch keine Angebotslogik aktiv.
          </div>
        </Panel>
        <Panel className="border-zinc-800 bg-zinc-950/75">
          <PanelHeader>
            <div>
              <PanelTitle>Ausgehende Anfragen</PanelTitle>
              <PanelDescription>Hier landen spaeter Angebote an andere Manager.</PanelDescription>
            </div>
            <ShoppingCart size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
            Vorgemerkt fuer Spieler-zu-Spieler-Transfers.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DeadlineView({ isHost, ownClub, snapshot }: { isHost: boolean; ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const deadline = snapshot.deadline;
  const activeAuction = deadline?.active_auction ?? null;
  const currentClub = snapshot.clubs.find((club) => club.id === activeAuction?.current_bid_club_id);
  const highestBidClub = snapshot.clubs.find((club) => club.id === activeAuction?.winning_club_id);
  const isMyTurn = Boolean(ownClub && activeAuction?.current_bid_club_id === ownClub.id);
  const ownSquadSize = snapshot.club_overview?.squad.length ?? 0;
  const nextBid = activeAuction ? getMinimumNextBid(activeAuction.current_amount, activeAuction.minimum_bid) : 0;
  const defaultBidMillions = Math.ceil(nextBid / DEADLINE_BID_STEP);
  const softTimerStarted = activeAuction?.turn_started_at ? formatSavedAt(activeAuction.turn_started_at) : "noch nicht gestartet";

  if (!ownClub || !deadline) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Deadline Day</PanelTitle>
            <PanelDescription>Deadline-Day-Daten werden vorbereitet.</PanelDescription>
          </div>
          <Gavel size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  if (deadline.setup_error) {
    return (
      <Panel className="border-amber-900 bg-amber-950/30">
        <PanelHeader>
          <div>
            <PanelTitle>Deadline Day Setup</PanelTitle>
            <PanelDescription>{deadline.setup_error}</PanelDescription>
          </div>
          <Gavel size={18} className="text-amber-200" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  const allDone = deadline.auctions.length > 0 && deadline.completed_count >= deadline.auction_count;

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Deadline Day</PanelTitle>
            <PanelDescription>Reihum bieten, passen oder den Zuschlag mitnehmen.</PanelDescription>
          </div>
          <Gavel size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric detail="Saisonmarkt" icon={ClipboardList} label="Auktionen" value={`${deadline.completed_count}/${deadline.auction_count}`} />
          <Metric detail={isMyTurn ? "Du bist dran" : "aktueller Manager"} icon={ListOrdered} label="Am Zug" value={currentClub?.club_name ?? "Kein Turn"} />
          <Metric detail={`seit ${softTimerStarted}`} icon={CalendarDays} label="Soft Timer" value={`${DEADLINE_TURN_SECONDS}s`} />
          <Metric detail="Gebotsschritt" icon={Banknote} label="Naechstes Gebot" value={activeAuction ? formatMoney(nextBid) : "-"} />
        </div>
      </Panel>

      {deadline.auctions.length === 0 ? (
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Markt vorbereiten</PanelTitle>
              <PanelDescription>Es werden {deadline.auction_count} zufaellige Spieler aus dem Pool gezogen.</PanelDescription>
            </div>
            <ShoppingCart size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          {isHost ? (
            <form action={initializeDeadlineDayAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <Button type="submit">
                <Play size={16} aria-hidden />
                Deadline Day initialisieren
              </Button>
            </form>
          ) : (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
              Wartet darauf, dass der Host den Deadline Day vorbereitet.
            </div>
          )}
        </Panel>
      ) : null}

      {activeAuction ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="border-[var(--club-border)] bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Aktive Auktion #{activeAuction.auction_index + 1}</PanelTitle>
                <PanelDescription>
                  Mindestpreis {formatMoney(activeAuction.minimum_bid)}
                  {highestBidClub ? ` - Hoechstgebot ${formatMoney(activeAuction.current_amount)} von ${highestBidClub.club_name}` : ""}
                </PanelDescription>
              </div>
              <Badge tone="green">aktiv</Badge>
            </PanelHeader>
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="max-w-[220px]">
                <PlayerCard player={mapDbPlayerToPlayerCardData(activeAuction.player)} variant="draft" />
              </div>
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <SmallInfo label="Spieler" value={activeAuction.player.display_name} />
                  <SmallInfo label="Position" value={getPlayerPositionLabel(activeAuction.player)} />
                  <SmallInfo label="Mindestpreis" value={formatMoney(activeAuction.minimum_bid)} />
                  <SmallInfo label="Aktuelles Gebot" value={activeAuction.current_amount > 0 ? formatMoney(activeAuction.current_amount) : "Noch kein Gebot"} />
                </div>
                {isMyTurn ? (
                  <div className="rounded-md border border-lime-400/30 bg-lime-400/10 p-3">
                    <p className="text-sm font-semibold text-lime-100">Du bist am Zug</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <form action={placeDeadlineBidAction} className="contents">
                        <input name="game_id" type="hidden" value={snapshot.game.id} />
                        <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                        <input name="auction_id" type="hidden" value={activeAuction.id} />
                        <input
                          className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none focus:border-[var(--club-color)]"
                          defaultValue={defaultBidMillions}
                          min={defaultBidMillions}
                          name="amount_millions"
                          type="number"
                        />
                        <Button disabled={ownClub.money < nextBid || ownSquadSize >= 23} title={getDeadlineBidTitle(ownClub.money, nextBid, ownSquadSize)} type="submit">
                          Bieten
                        </Button>
                      </form>
                      <form action={passDeadlineBidAction}>
                        <input name="game_id" type="hidden" value={snapshot.game.id} />
                        <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                        <input name="auction_id" type="hidden" value={activeAuction.id} />
                        <Button type="submit" variant="outline">
                          Passen
                        </Button>
                      </form>
                    </div>
                    <p className="mt-2 text-xs text-lime-100/75">Eingabe in Millionen, Gebotsschritt 1M.</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-400">
                    Wartet auf {currentClub?.club_name ?? "den naechsten Manager"}.
                  </div>
                )}
                {isHost && activeAuction.status === "resolving" ? (
                  <form action={resolveDeadlineAuctionAction}>
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="auction_id" type="hidden" value={activeAuction.id} />
                    <Button type="submit" variant="secondary">
                      Auktion synchronisieren
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel className="border-[var(--club-border)] bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Gebote</PanelTitle>
                <PanelDescription>Gepasste Manager fallen aus dieser Auktion raus.</PanelDescription>
              </div>
              <ListOrdered size={18} className="text-[var(--club-color)]" aria-hidden />
            </PanelHeader>
            <div className="space-y-2">
              {snapshot.clubs.map((club) => {
                const bid = activeAuction.bids.find((item) => item.club_id === club.id);
                const passed = activeAuction.passed_club_ids.includes(club.id);

                return (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={club.id}>
                    <span className="truncate text-sm font-medium text-zinc-100">{club.club_name}</span>
                    <Badge tone={activeAuction.current_bid_club_id === club.id ? "green" : passed ? "red" : bid?.amount ? "blue" : "neutral"}>
                      {activeAuction.current_bid_club_id === club.id ? "am Zug" : passed ? "passt" : bid?.amount ? formatMoney(Number(bid.amount)) : "wartet"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      ) : deadline.auctions.length > 0 ? (
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>{allDone ? "Deadline Day abgeschlossen" : "Keine aktive Auktion"}</PanelTitle>
              <PanelDescription>{allDone ? "Der Host kann die Phase fortsetzen." : "Der Host kann bei Bedarf die Auktionen synchronisieren."}</PanelDescription>
            </div>
            <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
        </Panel>
      ) : null}

      {deadline.auctions.length > 0 ? <DeadlineAuctionList deadline={deadline} snapshot={snapshot} /> : null}
    </div>
  );
}

function DeadlineAuctionList({ deadline, snapshot }: { deadline: NonNullable<LobbySnapshot["deadline"]>; snapshot: LobbySnapshot }) {
  const clubNames = new Map(snapshot.clubs.map((club) => [club.id, club.club_name]));

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>Auktionsliste</PanelTitle>
          <PanelDescription>Alle Spieler, die in diesem Deadline Day auf den Markt kommen.</PanelDescription>
        </div>
        <ClipboardList size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {deadline.auctions.map((auction) => (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={auction.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-50">#{auction.auction_index + 1} {auction.player.display_name}</p>
                <p className="mt-1 text-xs text-zinc-500">Min. {formatMoney(auction.minimum_bid)}</p>
              </div>
              <Badge tone={getAuctionBadgeTone(auction.status)}>{getAuctionStatusLabel(auction.status)}</Badge>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              {auction.winning_club_id ? `${clubNames.get(auction.winning_club_id) ?? "Club"} - ${formatMoney(auction.current_amount)}` : "Noch kein Zuschlag"}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function LineupView({ ownClub, snapshot }: { ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const overview = snapshot.club_overview;

  if (!ownClub || !overview) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Aufstellung</PanelTitle>
            <PanelDescription>Kaderdaten werden geladen.</PanelDescription>
          </div>
          <Shield size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  const lineupCards = getSortedSquadPlayers(overview.squad).map(mapOwnedPlayerToLineupCardData);
  const hasGoalkeeper = lineupCards.some((card) => card.positions.includes("GK"));

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Aufstellung</PanelTitle>
            <PanelDescription>Ziehe Karten in Positionsfelder. Ohne Torwart wird Given als 1-Stern-Default eingesetzt.</PanelDescription>
          </div>
          <Shield size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric detail="aktueller Kader" icon={Users} label="Spieler" value={`${overview.squad.length}`} />
          <Metric detail={hasGoalkeeper ? "eigener Keeper" : "Default Given aktiv"} icon={Shield} label="Torwart" value={hasGoalkeeper ? "vorhanden" : "Given"} />
          <Metric detail="lokale Preview" icon={ClipboardList} label="Status" value="Drag & Drop" />
        </div>
      </Panel>

      <GameLineupBoard cards={lineupCards} gameId={snapshot.game.id} roomCode={snapshot.game.room_code} />
    </div>
  );
}

function ClubOverviewView({
  focus,
  ownClub,
  snapshot,
}: {
  focus: "grounds" | "squad";
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const overview = snapshot.club_overview;

  if (!ownClub || !overview) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>{focus === "squad" ? "Kaderuebersicht" : "Vereinsgelaende"}</PanelTitle>
            <PanelDescription>Clubdaten werden geladen.</PanelDescription>
          </div>
          <Building2 size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {focus === "grounds" ? <ClubFinancePanel ownClub={ownClub} overview={overview} snapshot={snapshot} /> : null}
      {focus === "grounds" ? <FacilityUpgradePanel ownClub={ownClub} overview={overview} snapshot={snapshot} /> : null}
      <SquadPanel overview={overview} title={focus === "squad" ? "Kaderuebersicht" : "Gesamter Kader"} />
      {focus === "grounds" ? <ClubCardsPanel overview={overview} /> : null}
    </div>
  );
}

function ClubFinancePanel({
  ownClub,
  overview,
  snapshot,
}: {
  ownClub: LobbyClub;
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  snapshot: LobbySnapshot;
}) {
  const finance = overview.finance;

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>{ownClub.club_name}</PanelTitle>
          <PanelDescription>Finanzen, Kaderwert und erwartete Saison-Effekte.</PanelDescription>
        </div>
        <Banknote size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric detail="aktueller Kontostand" icon={Banknote} label="Geld" value={formatMoney(finance.money)} />
        <Metric detail={`${formatStars(finance.squad_stars)} Kadersterne`} icon={Sparkles} label="Kaderstaerke" value={`${formatStars(finance.squad_stars)}`} />
        <Metric detail="1M pro Stern" icon={Users} label="Gehaelter" value={formatMoney(finance.wages)} />
        <Metric detail={`Stadion L${ownClub.stadium_level ?? 1} + ${getClubStatusLabel(ownClub.status)}`} icon={Building2} label="Stadion" value={formatMoney(finance.stadium_income)} />
        <Metric detail={`${snapshot.clubs.length} Clubs, Platz #${ownClub.season_rank ?? 1}`} icon={Trophy} label="Praemie" value={formatMoney(finance.placement_reward)} />
      </div>
      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-xs font-medium uppercase text-zinc-500">Voraussichtlicher Nettoeffekt</p>
        <p className={cn("mt-2 text-2xl font-semibold", finance.projected_net >= 0 ? "text-emerald-200" : "text-rose-200")}>
          {formatMoney(finance.projected_net)}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Einnahmen {formatMoney(finance.projected_income)} minus Gehaelter {formatMoney(finance.wages)}
        </p>
      </div>
    </Panel>
  );
}

function FacilityUpgradePanel({
  ownClub,
  overview,
  snapshot,
}: {
  ownClub: LobbyClub;
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  snapshot: LobbySnapshot;
}) {
  const actionsThisSeason = overview.investments.map((investment) => investment.action);
  const investmentPhaseActive = isInvestmentPhase(snapshot.game.phase);
  const facilities: Array<{
    action: UpgradeAction;
    detail: string;
    icon: typeof Home;
    label: string;
    level: number;
  }> = [
    {
      action: "training",
      detail: "Entwicklung und Potenzialsterne",
      icon: Dumbbell,
      label: "Training",
      level: ownClub.training_level ?? 1,
    },
    {
      action: "scouting",
      detail: "Mehr Karten in Scoutingphasen",
      icon: Eye,
      label: "Scouting",
      level: ownClub.scouting_level ?? 1,
    },
    {
      action: "stadium",
      detail: "Hoehere Stadioneinnahmen",
      icon: Building2,
      label: "Stadion",
      level: ownClub.stadium_level ?? 1,
    },
  ];

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>Vereinsgelaende</PanelTitle>
          <PanelDescription>
            {overview.investments.length}/2 Investment-Aktionen in Saison {overview.season_number} verwendet.
          </PanelDescription>
        </div>
        <Building2 size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 lg:grid-cols-3">
        {facilities.map((facility) => {
          const check = canUpgradeFacility({
            action: facility.action,
            actionsThisSeason,
            currentLevel: facility.level,
            money: overview.finance.money,
          });
          const upgradeDisabled = !investmentPhaseActive || !check.ok;
          const cost = getUpgradeCost(facility.action, facility.level);
          const Icon = facility.icon;

          return (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4" key={facility.action}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-50">{facility.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{facility.detail}</p>
                </div>
                <Icon size={18} className="text-[var(--club-color)]" aria-hidden />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-zinc-500">Level</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-50">{facility.level}/4</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase text-zinc-500">Naechstes Upgrade</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{facility.level >= 4 ? "Max" : formatMoney(cost)}</p>
                </div>
              </div>
              <form action={upgradeInvestmentAction} className="mt-4">
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="club_id" type="hidden" value={ownClub.id} />
                <input name="action" type="hidden" value={facility.action} />
                <Button
                  className="w-full"
                  disabled={upgradeDisabled}
                  title={!investmentPhaseActive ? "Nur in der Investmentphase" : check.ok ? "Upgrade kaufen" : getUpgradeReasonLabel(check.reason)}
                  type="submit"
                >
                  {!investmentPhaseActive ? "Investmentphase abwarten" : check.ok ? "Upgrade kaufen" : getUpgradeReasonLabel(check.reason)}
                </Button>
              </form>
            </div>
          );
        })}
      </div>
      {overview.investments.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {overview.investments.map((investment) => (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm" key={investment.id}>
              <p className="font-semibold text-zinc-100">{getInvestmentLabel(investment.action)}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatMoney(investment.cost)} - Saison {investment.season_number}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function SquadPanel({
  overview,
  title,
}: {
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  title: string;
}) {
  const sortedSquad = getSortedSquadPlayers(overview.squad);

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>{title}</PanelTitle>
          <PanelDescription>{overview.squad.length} Spieler im aktuellen Spielstand.</PanelDescription>
        </div>
        <Users size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      {overview.squad.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
          Noch keine Spieler im Kader. Nach dem Draft erscheinen sie hier.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sortedSquad.map((owned) => {
            const card = mapOwnedPlayerToCardData(owned);

            return (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/45 p-2" key={owned.id}>
                <PlayerCard disabled={owned.injured} player={card} variant="draft" />
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <SmallInfo label="Status" value={owned.current_zone === "bench" ? "Nicht aufgestellt" : "Aufgestellt"} />
                  <SmallInfo label="Zone" value={owned.current_zone} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ClubCardsPanel({ overview }: { overview: NonNullable<LobbySnapshot["club_overview"]> }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Mitarbeiter</PanelTitle>
            <PanelDescription>Staff-Karten des Clubs.</PanelDescription>
          </div>
          <Crown size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <CardList
          empty="Noch keine Mitarbeiter."
          items={overview.staff.map((staff) => ({
            detail: formatEffects(staff.card.effects),
            meta: staff.card.price ? formatMoney(staff.card.price) : "Staff",
            title: staff.card.display_name,
          }))}
        />
      </Panel>
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Game-Changer</PanelTitle>
            <PanelDescription>Verfuegbare Spezialkarten.</PanelDescription>
          </div>
          <Sparkles size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <CardList
          empty="Noch keine Game-Changer."
          items={overview.game_changers.map((gameChanger) => ({
            detail: formatEffects(gameChanger.card.effects),
            meta: gameChanger.used_at ? "genutzt" : gameChanger.card.timing,
            title: gameChanger.card.display_name,
          }))}
        />
      </Panel>
    </div>
  );
}

function CardList({ empty, items }: { empty: string; items: Array<{ detail: string; meta: string; title: string }> }) {
  if (items.length === 0) {
    return <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={`${item.title}-${item.meta}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-zinc-100">{item.title}</p>
            <Badge>{item.meta}</Badge>
          </div>
          <p className="mt-2 text-xs text-zinc-500">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function MatchdayView({ isHost, ownClub, snapshot }: { isHost: boolean; ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const season = snapshot.season;

  if (!season) {
    return (
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Spieltagsuebersicht</PanelTitle>
            <PanelDescription>Die Saison wird beim Wechsel in die Prematch-Phase erzeugt.</PanelDescription>
          </div>
          <CalendarDays size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  if (season.setup_error) {
    return (
      <Panel className="border-amber-700 bg-amber-950/30">
        <PanelHeader>
          <div>
            <PanelTitle>Saison-Setup fehlt</PanelTitle>
            <PanelDescription>{season.setup_error}</PanelDescription>
          </div>
          <CalendarDays size={18} className="text-amber-200" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  const matchdayFixtures = season.fixtures.filter((fixture) => fixture.matchday === season.current_matchday);
  const completedCount = matchdayFixtures.filter((fixture) => fixture.status === "completed").length;

  if (season.fixtures.length === 0) {
    return (
      <Panel className="border-amber-700 bg-amber-950/30">
        <PanelHeader>
          <div>
            <PanelTitle>Keine Spieltage gefunden</PanelTitle>
            <PanelDescription>
              Fuer diesen Spielstand wurden noch keine Fixtures erzeugt. Der Host kann den Saisonplan jetzt initialisieren.
            </PanelDescription>
          </div>
          <CalendarDays size={18} className="text-amber-200" aria-hidden />
        </PanelHeader>
        {isHost ? (
          <form action={initializeSeasonScheduleAction}>
            <input name="game_id" type="hidden" value={snapshot.game.id} />
            <input name="room_code" type="hidden" value={snapshot.game.room_code} />
            <Button type="submit" variant="primary">
              Saisonplan erzeugen
            </Button>
          </form>
        ) : (
          <Button disabled variant="outline">
            Wartet auf Host
          </Button>
        )}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Spieltagsuebersicht</PanelTitle>
            <PanelDescription>
              Spieltag {season.current_matchday} von {Math.max(...season.fixtures.map((fixture) => fixture.matchday), 1)}
            </PanelDescription>
          </div>
          <Badge tone={completedCount === matchdayFixtures.length && matchdayFixtures.length > 0 ? "green" : "blue"}>
            {completedCount}/{matchdayFixtures.length} abgeschlossen
          </Badge>
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric detail="aktueller Spieltag" icon={CalendarDays} label="Spieltag" value={String(season.current_matchday)} />
          <Metric detail="Saisonmodus" icon={ListOrdered} label="Format" value={snapshot.game.settings.season_mode === "double_round_robin" ? "Hin/Rueck" : "5 Spiele"} />
          <Metric detail="Tabellenpunkte" icon={Trophy} label="Punkte" value={snapshot.game.settings.match_points_mode === "classic_6_2_0" ? "6/2/0" : "3/1/0"} />
        </div>
      </Panel>

      <div className="grid gap-4">
        {matchdayFixtures.map((fixture) => (
          <FixtureCard fixture={fixture} isHost={isHost} key={fixture.id} ownClub={ownClub} snapshot={snapshot} />
        ))}
      </div>
    </div>
  );
}

function FixtureCard({
  fixture,
  isHost,
  ownClub,
  snapshot,
}: {
  fixture: SeasonFixtureSnapshot;
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const home = fixture.home_participant;
  const away = fixture.away_participant;
  const ownSide = ownClub?.id === home.club_id ? "home" : ownClub?.id === away.club_id ? "away" : null;
  const ownLocked = ownSide === "home" ? fixture.home_lineup_locked : ownSide === "away" ? fixture.away_lineup_locked : false;
  const hasCpu = home.kind === "cpu" || away.kind === "cpu";
  const bothCpu = home.kind === "cpu" && away.kind === "cpu";
  const bothHumanLineupsLocked = home.kind === "human" && away.kind === "human" && fixture.home_lineup_locked && fixture.away_lineup_locked;
  const canLock = Boolean(ownSide && fixture.status !== "completed" && !ownLocked);
  const canResolveOwnCpuMatch = Boolean(ownSide && hasCpu && ownLocked && fixture.status !== "completed");
  const canHostResolveCpuOnlyMatch = Boolean(isHost && bothCpu && fixture.status !== "completed");
  const canHostResolvePvpMatch = Boolean(isHost && !hasCpu && bothHumanLineupsLocked && fixture.status !== "completed");
  const ownPowerSummary = getOwnLineupPowerSummary(snapshot);
  const result = parseFixtureResult(fixture.result);

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_220px]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">Spieltag {fixture.matchday}</p>
              <h3 className="mt-1 text-xl font-semibold text-zinc-50">
                {home.display_name} <span className="text-zinc-500">vs</span> {away.display_name}
              </h3>
            </div>
            <Badge tone={fixture.status === "completed" ? "green" : "amber"}>{fixture.status === "completed" ? "abgeschlossen" : "offen"}</Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <FixtureSideCard
              locked={fixture.home_lineup_locked}
              lineup={fixture.home_cpu_lineup}
              participant={home}
              powerSummary={home.club_id === ownClub?.id && fixture.home_lineup_locked ? ownPowerSummary : null}
              score={fixture.home_score}
              thirdPoints={fixture.home_third_points}
            />
            <FixtureSideCard
              locked={fixture.away_lineup_locked}
              lineup={fixture.away_cpu_lineup}
              participant={away}
              powerSummary={away.club_id === ownClub?.id && fixture.away_lineup_locked ? ownPowerSummary : null}
              score={fixture.away_score}
              thirdPoints={fixture.away_third_points}
            />
          </div>

          {result ? (
            <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs font-medium uppercase text-zinc-500">Matchlog</p>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {result.thirds.map((third) => (
                  <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3" key={third.index}>
                    <p className="text-xs font-semibold text-zinc-200">Drittel {third.index}: {getThirdLabel(third.label)}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Heim {third.home.total} ({third.home.zone_stars} Zone inkl. Links + {third.home.dice.join("+")}) - Auswaerts {third.away.total} ({third.away.zone_stars} Zone inkl. Links + {third.away.dice.join("+")})
                    </p>
                  </div>
                ))}
              </div>
              {result.events.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.events.map((event, index) => (
                    <Badge key={`${event.event_type}-${index}`} tone={event.event_type === "injury" ? "red" : "blue"}>
                      {event.event_type === "injury" ? "Verletzung" : "Game-Changer"} Wurf {event.dice.join("+")} {event.zone}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="space-y-2 text-sm text-zinc-400">
            <p>
              {ownSide ? (ownLocked ? "Deine Aufstellung ist gelockt." : "Locke deine Aufstellung fuer dieses Match.") : "Du bist in diesem Fixture Zuschauer."}
            </p>
            <p>CPU-Aufstellungen werden stabil am Fixture gespeichert.</p>
          </div>
          <div className="space-y-2">
            {canLock ? (
              <form action={lockFixtureLineupAction}>
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="fixture_id" type="hidden" value={fixture.id} />
                <Button className="w-full" type="submit" variant="primary">
                  Aufstellung locken
                </Button>
              </form>
            ) : null}
            {canResolveOwnCpuMatch || canHostResolveCpuOnlyMatch || canHostResolvePvpMatch ? (
              <form action={resolveFixtureAction}>
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="fixture_id" type="hidden" value={fixture.id} />
                <Button className="w-full" type="submit">
                  {canHostResolveCpuOnlyMatch ? "CPU-Spiel simulieren" : "Match simulieren"}
                </Button>
              </form>
            ) : null}
            {!canLock && !canResolveOwnCpuMatch && !canHostResolveCpuOnlyMatch && !canHostResolvePvpMatch ? (
              <Button className="w-full" disabled variant="outline">
                {fixture.status === "completed" ? "Fertig" : "Warten"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function FixtureSideCard({
  lineup,
  locked,
  participant,
  powerSummary,
  score,
  thirdPoints,
}: {
  lineup: NonNullable<LobbySnapshot["season"]>["fixtures"][number]["home_cpu_lineup"];
  locked: boolean;
  participant: NonNullable<LobbySnapshot["season"]>["fixtures"][number]["home_participant"];
  powerSummary?: LineupPowerSummary | null;
  score?: number | null;
  thirdPoints?: number | null;
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
            <p className="truncate font-semibold text-zinc-50">{participant.display_name}</p>
            <p className="mt-1 text-xs text-zinc-500">{participant.kind === "cpu" ? "CPU-Team" : "Manager-Team"}</p>
          </div>
        </div>
        <Badge tone={participant.kind === "cpu" || locked ? "green" : "neutral"}>{participant.kind === "cpu" ? "CPU" : locked ? "locked" : "offen"}</Badge>
      </div>
      {lineup || powerSummary ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <SmallInfo label="DEF" value={formatStars(Number(lineup?.def_stars ?? powerSummary?.DEF.total ?? 0))} />
          <SmallInfo label="MID" value={formatStars(Number(lineup?.mid_stars ?? powerSummary?.MID.total ?? 0))} />
          <SmallInfo label="ATT" value={formatStars(Number(lineup?.att_stars ?? powerSummary?.ATT.total ?? 0))} />
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SmallInfo label="Drittelpunkte" value={thirdPoints == null ? "-" : formatStars(thirdPoints)} />
        <SmallInfo label="Tabellenpunkte" value={score == null ? "-" : String(score)} />
      </div>
    </div>
  );
}

function TableView({ snapshot }: { snapshot: LobbySnapshot }) {
  const season = snapshot.season;

  if (!season || season.setup_error) {
    return (
      <Panel className={cn("bg-zinc-950/85", season?.setup_error ? "border-amber-700" : "border-[var(--club-border)]")}>
        <PanelHeader>
          <div>
            <PanelTitle>Tabelle</PanelTitle>
            <PanelDescription>{season?.setup_error ?? "Noch keine Saison-Tabelle vorhanden. Sie entsteht beim Start der Prematch-Phase."}</PanelDescription>
          </div>
          <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Managerwertung</PanelTitle>
            <PanelDescription>Kernwertung: Kadersterne plus erspielte Saisonpunkte.</PanelDescription>
          </div>
          <Crown size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Club</th>
                <th className="py-2 pr-3">Kader</th>
                <th className="py-2 pr-3">Saisonpkt</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Attraktivitaet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {season.manager_standings.map((standing) => (
                <tr className="text-zinc-300" key={standing.club_id}>
                  <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.rank}</td>
                  <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.club_name}</td>
                  <td className="py-3 pr-3">{formatStars(standing.squad_stars)}</td>
                  <td className="py-3 pr-3">{standing.season_match_points}</td>
                  <td className="py-3 pr-3 text-base font-bold text-zinc-50">{standing.season_score}</td>
                  <td className="py-3 pr-3">
                    <Badge tone="blue">{getClubStatusLabel(standing.status)}</Badge>
                  </td>
                  <td className="py-3 pr-3">{standing.attractiveness_stars} Sterne</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Liga-Tabelle</PanelTitle>
            <PanelDescription>Kosmetische Saisonansicht mit Human- und CPU-Teams.</PanelDescription>
          </div>
          <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Typ</th>
              <th className="py-2 pr-3">Sp</th>
              <th className="py-2 pr-3">S</th>
              <th className="py-2 pr-3">U</th>
              <th className="py-2 pr-3">N</th>
              <th className="py-2 pr-3">Drittel</th>
              <th className="py-2 pr-3">Pkt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {season.standings.map((standing) => {
              const thirdDiff = standing.third_points_for - standing.third_points_against;
              return (
                <tr className="text-zinc-300" key={standing.participant_id}>
                  <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.rank}</td>
                  <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.participant.display_name}</td>
                  <td className="py-3 pr-3">
                    <Badge tone={standing.participant.kind === "cpu" ? "blue" : "green"}>{standing.participant.kind === "cpu" ? "CPU" : "Manager"}</Badge>
                  </td>
                  <td className="py-3 pr-3">{standing.played}</td>
                  <td className="py-3 pr-3">{standing.wins}</td>
                  <td className="py-3 pr-3">{standing.draws}</td>
                  <td className="py-3 pr-3">{standing.losses}</td>
                  <td className="py-3 pr-3">
                    {formatStars(standing.third_points_for)}:{formatStars(standing.third_points_against)} ({thirdDiff >= 0 ? "+" : ""}
                    {formatStars(thirdDiff)})
                  </td>
                  <td className="py-3 pr-3 text-base font-bold text-zinc-50">{standing.match_points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Panel>
    </div>
  );
}

function SettingsView({
  isHost,
  snapshot,
}: {
  isHost: boolean;
  snapshot: LobbySnapshot;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Settings</PanelTitle>
            <PanelDescription>Allgemeine Einstellungen fuer diesen Spielstand.</PanelDescription>
          </div>
          <Settings size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Room</p>
            <p className="mt-2 font-mono text-lg font-semibold text-zinc-50">{snapshot.game.room_code}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Phase</p>
            <p className="mt-2 text-lg font-semibold text-zinc-50">{snapshot.game.phase}</p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Save</p>
            <p className="mt-2 text-lg font-semibold text-zinc-50">v{snapshot.game.save_version ?? 1}</p>
          </div>
        </div>
      </Panel>

      {isHost ? (
        <Panel className="border-rose-950 bg-rose-950/30">
          <PanelHeader>
            <div>
              <PanelTitle>Spielstand loeschen</PanelTitle>
              <PanelDescription>Entfernt diese Lobby und alle zugehoerigen Daten dauerhaft.</PanelDescription>
            </div>
            <Trash2 size={18} className="text-rose-300" aria-hidden />
          </PanelHeader>
          {!confirmDelete ? (
            <Button className="border-rose-900 text-rose-100 hover:bg-rose-950" onClick={() => setConfirmDelete(true)} type="button" variant="outline">
              <Trash2 size={16} aria-hidden />
              Loeschen vorbereiten
            </Button>
          ) : (
            <div className="rounded-md border border-rose-800 bg-rose-950/70 p-4">
              <p className="text-sm font-medium text-rose-100">Diesen Spielstand wirklich loeschen?</p>
              <p className="mt-1 text-sm text-rose-200/75">Diese Aktion kann nicht rueckgaengig gemacht werden.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={deleteGameAction}>
                  <input name="game_id" type="hidden" value={snapshot.game.id} />
                  <Button className="bg-rose-600 text-white hover:bg-rose-500" type="submit">
                    Endgueltig loeschen
                  </Button>
                </form>
                <Button onClick={() => setConfirmDelete(false)} type="button" variant="secondary">
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function renderView(
  view: GameView,
  props: {
    currentTurnClub: LobbyClub | undefined;
    isHost: boolean;
    ownClub: LobbyClub | undefined;
    snapshot: LobbySnapshot;
  },
) {
  if (view === "dashboard") {
    return <DashboardView {...props} />;
  }

  if (view === "settings") {
    return <SettingsView isHost={props.isHost} snapshot={props.snapshot} />;
  }

  if (view === "draft") {
    return <DraftView ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "training") {
    return <TrainingView isHost={props.isHost} ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "scouting") {
    return <ScoutingView isHost={props.isHost} ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "grounds" || view === "squad") {
    return <ClubOverviewView focus={view} ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "transfer") {
    return <TransferMarketView ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "lineup") {
    return <LineupView ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "deadline") {
    return <DeadlineView isHost={props.isHost} ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "matchday") {
    return <MatchdayView isHost={props.isHost} ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "table") {
    return <TableView snapshot={props.snapshot} />;
  }

  return null;
}

function normalizeView(value: string | undefined): GameView {
  const views: GameView[] = ["dashboard", "squad", "grounds", "lineup", "matchday", "transfer", "table", "settings", "draft", "training", "scouting", "deadline"];

  return views.includes(value as GameView) ? (value as GameView) : "dashboard";
}

function Metric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: typeof Home;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-zinc-50">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{detail}</p>
        </div>
        <Icon size={16} className="text-[var(--club-color)]" aria-hidden />
      </div>
    </div>
  );
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
      <p className="font-medium uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-zinc-200">{value}</p>
    </div>
  );
}

function getTrainingDisabledLabel(
  trainingEnabled: boolean,
  check: ReturnType<typeof canTrainOwnedPlayer>,
) {
  if (!trainingEnabled) {
    return "Phase gesperrt";
  }

  return check.ok ? "Trainieren" : getTrainingReasonLabel(check.reason);
}

function getScoutingCheckLabel(check: { ok: true } | { ok: false; reason: string }) {
  return check.ok ? "OK" : getScoutingActionLabel(check.reason);
}

function getDeadlineBidTitle(money: number, nextBid: number, squadSize: number) {
  if (squadSize >= 23) {
    return getDeadlineActionLabel("squad_full");
  }

  if (money < nextBid) {
    return getDeadlineActionLabel("insufficient_money");
  }

  return "Gebot abgeben";
}

function getAuctionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "aktiv",
    passed: "nicht verkauft",
    resolved: "verkauft",
    resolving: "wird aufgeloest",
    scheduled: "wartet",
  };

  return labels[status] ?? status;
}

function getAuctionBadgeTone(status: string): "neutral" | "green" | "blue" | "red" {
  if (status === "open") {
    return "green";
  }

  if (status === "resolved") {
    return "blue";
  }

  if (status === "passed") {
    return "red";
  }

  return "neutral";
}

function getSortedSquadPlayers(squad: NonNullable<LobbySnapshot["club_overview"]>["squad"]) {
  return [...squad].sort((a, b) => {
    const stateDiff = getLineupStateRank(a.current_zone) - getLineupStateRank(b.current_zone);
    if (stateDiff !== 0) {
      return stateDiff;
    }

    const zoneDiff = getZoneRank(a.current_zone) - getZoneRank(b.current_zone);
    if (zoneDiff !== 0) {
      return zoneDiff;
    }

    const positionDiff = getPositionRank(a.player) - getPositionRank(b.player);
    if (positionDiff !== 0) {
      return positionDiff;
    }

    const starsDiff = Number(b.current_stars) - Number(a.current_stars);
    if (starsDiff !== 0) {
      return starsDiff;
    }

    return a.player.display_name.localeCompare(b.player.display_name, "de");
  });
}

function getLineupStateRank(zone: string) {
  return zone === "bench" ? 1 : 0;
}

function getZoneRank(zone: string) {
  const order: Record<string, number> = {
    GK: 0,
    DEF: 1,
    MID: 2,
    ATT: 3,
    bench: 4,
  };

  return order[zone] ?? 5;
}

function getPositionRank(player: DraftPlayerRow) {
  const positions = (player.eligible_positions?.length ? player.eligible_positions : [player.position]) as PlayerCardPosition[];
  const order: Record<PlayerCardPosition, number> = {
    GK: 0,
    DEF: 1,
    MID: 2,
    ATT: 3,
  };

  return Math.min(...positions.map((position) => order[position] ?? 9));
}

function mapOwnedPlayerToCardData(owned: NonNullable<LobbySnapshot["club_overview"]>["squad"][number]): PlayerCardData {
  const card = mapDbPlayerToPlayerCardData(owned.player);
  const currentStars = Number(owned.current_stars);

  return {
    ...card,
    skill: {
      ...card.skill,
      current: currentStars,
      potential: currentStars,
      max: Number(owned.player.skill_max ?? card.skill.max),
    },
  };
}

function mapOwnedPlayerToLineupCardData(owned: NonNullable<LobbySnapshot["club_overview"]>["squad"][number]): PlayerCardData & {
  injured?: boolean;
  sourceZone?: string;
  lineupSlot?: number | null;
} {
  return {
    ...mapOwnedPlayerToCardData(owned),
    id: owned.id,
    injured: owned.injured,
    lineupSlot: owned.lineup_slot,
    sourceZone: owned.current_zone,
  };
}

function getPlayerPositionLabel(player: DraftPlayerRow) {
  return getPositionLabel((player.eligible_positions?.length ? player.eligible_positions : [player.position]) as PlayerCardPosition[]);
}

function getInvestmentLabel(action: string) {
  const labels: Record<string, string> = {
    scouting: "Scouting",
    stadium: "Stadion",
    staff: "Mitarbeiter",
    training: "Training",
  };

  return labels[action] ?? action;
}

function formatEffects(effects: unknown[]) {
  if (!effects.length) {
    return "Keine Effekte hinterlegt.";
  }

  return effects
    .map((effect) => {
      if (!effect || typeof effect !== "object") {
        return "Effekt";
      }

      const type = "type" in effect ? String(effect.type) : "Effekt";
      return type.replaceAll("_", " ");
    })
    .join(", ");
}

function parseFixtureResult(value: Record<string, unknown> | null | undefined) {
  if (!value || !Array.isArray(value.thirds)) {
    return null;
  }

  return value as {
    events: Array<{
      dice: [number, number];
      event_type: "game_changer" | "injury";
      zone: string;
    }>;
    thirds: Array<{
      away: {
        dice: [number, number];
        total: number;
        zone_stars: number;
      };
      home: {
        dice: [number, number];
        total: number;
        zone_stars: number;
      };
      index: number;
      label: "away_attack" | "home_attack" | "midfield";
    }>;
  };
}

function getThirdLabel(label: "away_attack" | "home_attack" | "midfield") {
  const labels = {
    away_attack: "Auswaerts greift an",
    home_attack: "Heim greift an",
    midfield: "Mittelfeld",
  };

  return labels[label];
}

function getOwnLineupPowerSummary(snapshot: LobbySnapshot): LineupPowerSummary | null {
  const squad = snapshot.club_overview?.squad;

  if (!squad) {
    return null;
  }

  return calculateLineupPower(
    squad.map((owned) => ({
      chemistry_left: owned.player.chemistry_left,
      chemistry_right: owned.player.chemistry_right,
      current_stars: owned.current_stars,
      current_zone: owned.current_zone,
      injured: owned.injured,
      lineup_slot: owned.lineup_slot,
    })),
  );
}

function getClubLogoSrc(participant: NonNullable<LobbySnapshot["season"]>["fixtures"][number]["home_participant"]) {
  if (participant.kind !== "human") {
    return null;
  }

  const logoByName: Record<string, string> = {
    "Apex River United": "/AprexRiverUnited.png",
    "Blackwood Athletic": "/BlackwoodAthletic.png",
    "Crimson Cape FC": "/crimsonCape.png",
    "FC Dynamo Draft": "/DynamoDraft.png",
    "Golden Meadow United": "/GoldenMeadowUnited.png",
    "Vanguard FC": "/VanguardFC.png",
  };

  return logoByName[participant.display_name] ?? null;
}

function formatSavedAt(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSavedLine(value: string | null | undefined) {
  return value ? `Zuletzt gespeichert: ${formatSavedAt(value)}` : "Spielstand geladen";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function formatStars(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getClubStatusLabel(status: LobbyClub["status"]) {
  const labels: Record<string, string> = {
    established: "Established",
    mid_table: "Mid Table",
    newly_promoted: "Newly Promoted",
    title_contender: "Title Contender",
  };

  return labels[status ?? "newly_promoted"] ?? "Newly Promoted";
}

function getTurnFallback(phase: string, isHost: boolean) {
  if (phase === "lobby") {
    return isHost ? "Host" : "Wartet";
  }

  return "Noch offen";
}
