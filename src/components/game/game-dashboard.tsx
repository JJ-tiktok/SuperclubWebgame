"use client";

import { UserButton } from "@clerk/nextjs";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Award,
  Banknote,
  Building2,
  CalendarDays,
  ClipboardList,
  Crown,
  Dumbbell,
  Eye,
  Gavel,
  GraduationCap,
  Hammer,
  HeartPulse,
  Home,
  LineChart,
  ListOrdered,
  MapIcon,
  Medal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  advancePhaseAction,
  deleteGameAction,
  setPhaseDoneAction,
  setReadyFromDashboardAction,
  startGameFromDashboardAction,
  updateGameSettingsAction,
} from "@/app/games/actions/lobby";
import { makeDraftPickAction } from "@/app/games/actions/draft";
import {
  healPlayerMedicalAction,
  renameClubPlayerAction,
  respecPlayerArchetypeAction,
  trainPlayerAction,
  upgradeInvestmentAction,
} from "@/app/games/actions/offseason";
import {
  buyScoutedPlayerAction,
  drawScoutingPlayerAction,
  passAllScoutedPlayersAction,
  passScoutedPlayerAction,
  sellClubPlayerAction,
} from "@/app/games/actions/scouting";
import {
  initializeDeadlineDayAction,
  passDeadlineBidAction,
  placeDeadlineBidAction,
  resolveDeadlineAuctionAction,
} from "@/app/games/actions/deadline";
import {
  dismissStaffAction,
  recruitStaffOpenAction,
  recruitStaffResolveAction,
} from "@/app/games/actions/staff";
import {
  acceptPoachRequestAction,
  cancelPoachRequestAction,
  createPoachRequestAction,
  declinePoachRequestAction,
} from "@/app/games/actions/poach";
import {
  acceptTransferOfferAction,
  cancelTransferOfferAction,
  counterTransferOfferAction,
  createTransferOfferAction,
  declineTransferOfferAction,
} from "@/app/games/actions/transfers";
import {
  initializeSeasonScheduleAction,
  lockFixtureLineupAction,
  markReadyForNextThirdAction,
  resolveFixtureAction,
  startMatchAction,
  triggerDrawRerollAction,
} from "@/app/games/actions/match";
import { healInjuredPlayerAction } from "@/app/games/actions/game-changers";
import { resolveDisplayZoneBoosts, type ZoneModifier } from "@/lib/game/game-changer-effects";
import {
  formatMoney,
  formatSavedAt,
  formatSavedLine,
  formatStars,
  getAuctionBadgeTone,
  getAuctionStatusLabel,
  getClubStatusLabel,
  getEffectiveClubStatusLabel,
  getDeadlineBidTitle,
  getInvestmentLabel,
  getScoutingCheckLabel,
  getTrainingDisabledLabel,
  getTurnFallback,
  normalizeView,
  type GameView,
} from "@/components/game/lib/dashboard-helpers";
import { ContinentalView } from "@/components/game/continental/continental-view";
import { OpponentIntelPanel } from "@/components/game/opponent-intel-panel";
import { PlayerHighlightsPanel } from "@/components/game/player-highlights-panel";
import { HallOfFameView } from "@/components/game/hall-of-fame-view";
import { PrestigeView } from "@/components/game/prestige-view";
import { FinalSeasonBanner } from "@/components/game/final-season-banner";
import { GameEndView } from "@/components/game/game-end-view";
import { LobbySetupView } from "@/components/lobby/lobby-setup-view";
import {
  canUpgradeEndgameFacility,
  ENDGAME_FACILITY_LABELS,
  getEndgameFacilityLevel,
  getEndgameUpgradeCost,
  getEndgameUpgradeReasonLabel,
  getEndgameUnlockRequirement,
  getInvestmentActionLimit,
  isEndgameUnlockMet,
  resolveClubInvestmentStatus,
  type EndgameFacilityAction,
} from "@/lib/lobby/endgame-facilities";
import { ArchetypeMatchupGuide } from "@/components/game/shared/archetype-matchup-guide";
import { ViewGuidePanel } from "@/components/game/shared/view-guide-panel";
import { ArchetypeScoutCard, buildArchetypeScoutFromSquad, SquadArchetypeOverview } from "@/components/game/shared/squad-archetype-overview";
import { FixtureSideCard } from "@/components/game/shared/fixture-side-card";
import { MatchResultDetail, parseFixtureResult, type FixtureThird } from "@/components/game/shared/match-result-detail";
import { Metric, SmallInfo } from "@/components/game/shared/metric";
import { SquadPositionBreakdown } from "@/components/game/shared/squad-breakdown";
import { ActiveEffectsChip } from "@/components/game/active-effects-chip";
import { GameChangerChoiceModal } from "@/components/game/game-changer-choice-modal";
import { DevAdminMenu } from "@/components/dev/dev-admin-menu";
import { isDevEnvironment } from "@/lib/dev/dev-tools";
import { GameChangerPopup } from "@/components/game/game-changer-popup";
import { GameEventsDock } from "@/components/game/game-events-dock";
import { GameLineupBoard } from "@/components/game/game-lineup-board";
import { GameRealtimeBridge } from "@/components/game/game-realtime-bridge";
import { hydrateGameStoreIfNewer, useGameStore } from "@/components/game/game-store";
import { pickFresherSnapshot } from "@/components/game/snapshot-freshness";
import { CaptainPanel } from "@/components/game/captain-panel";
import { ClubBadge } from "@/components/game/club-badge";
import { AfterMatchCards, MatchCardsPanel } from "@/components/game/match-cards-panel";
import { SponsorPanel } from "@/components/game/sponsor-panel";
import { DrawnGameChangersList, PendingEffectsList } from "@/components/game/pending-effects-list";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { DEADLINE_BID_STEP, DEADLINE_TURN_SECONDS, getMinimumNextBid } from "@/lib/lobby/deadline";
import { ARCHETYPE_META } from "@/lib/lobby/archetypes";
import {
  createEmptyDraftOverviewPositionCounts,
  DRAFT_OVERVIEW_POSITIONS,
  getDraftOverviewPositionKey,
  mapDbPlayerToPlayerCardData,
} from "@/lib/lobby/draft";
import { canUpgradeFacility, getStaffRecruitBlockReason, getStaffRecruitHint, getStaffRecruitReasonLabel, getUpgradeCost, getUpgradeReasonLabel, type UpgradeAction } from "@/lib/lobby/investments";
import { isOffseasonPendingScopeActive } from "@/lib/lobby/offseason-pending-effects";
import { calculateLineupPower, getCaptainBoostExtra } from "@/lib/lobby/lineup-power";
import { getPhaseLabel, isFinalSeason, isInvestmentPhase } from "@/lib/lobby/phases";
import { isQualifiedTransferProfit } from "@/lib/lobby/prestige";
import { buildSeasonEndSummaryModel } from "@/lib/lobby/season-end-summary";
import { isClubStatusOverrideActive, resolveEffectiveClubStatus } from "@/lib/lobby/club-status";
import { getManagerScoreBand, getPlacementReward, getScoutingCapacity, getStadiumIncome, getTrainingCapacity, MAX_SQUAD_SIZE } from "@/lib/game/rules";
import { CPU_TIER_LABEL } from "@/lib/lobby/cpu-teams";
import { canStartLobby } from "@/lib/lobby/rules";
import {
  canBuyScoutedPlayer,
  getScoutingActionLabel,
  getScoutingPurchasePrice,
  isOffseasonTransfersBlocked,
  canDrawScoutingPlayer,
  canResolveScoutedPlayer,
  canSellClubPlayer,
  isOffseasonPhase,
  SCOUTING_PILES,
} from "@/lib/lobby/scouting";
import { getClubTheme } from "@/lib/lobby/theme";
import { canTrainOwnedPlayer, getTrainingEventPresentation } from "@/lib/lobby/training";
import { resolvePlayerSkillDisplayMax } from "@/lib/lobby/player-market";
import { isNlzOriginPlayer } from "@/lib/lobby/youth-generator";
import {
  getCardScoutingMoney,
  getCardTransferMoney,
  getCatalogMinimumBidFromPlayer,
  getOwnedCardTransferMillions,
  mapCatalogPlayerToCardData,
  mapOwnedPlayerToCardData,
  mapOwnedPlayerToLineupCardData,
} from "@/lib/lobby/player-card-mapper";
import {
  CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH,
  getClubPlayerDisplayName,
} from "@/lib/lobby/player-names";
import { MANAGER_TRANSFER_DEPARTURE_LIMIT } from "@/lib/lobby/transfers";
import { isPlayerUnavailableForSeason } from "@/lib/lobby/poach";
import type {
  ClubPlayerSnapshot,
  CpuStrengthTier,
  DraftPlayerRow,
  LobbyClub,
  LobbySnapshot,
  PoachRequestSnapshot,
  SeasonFixtureSnapshot,
  StaffOfferSnapshot,
  TransferOfferSnapshot,
} from "@/lib/lobby/types";
import { cn } from "@/lib/utils";
import { getPositionLabel, type PlayerCardData, type PlayerCardPosition } from "@/types/player-card";

type GameDashboardProps = {
  activeView?: string;
  currentUserId: string;
  snapshot: LobbySnapshot;
};

type LineupPowerSummary = {
  ATT: { base: number; chemistry: number; staffBonus: number; total: number };
  DEF: { base: number; chemistry: number; staffBonus: number; total: number };
  MID: { base: number; chemistry: number; staffBonus: number; total: number };
};

const mainMenu: Array<{ id: GameView; label: string; icon: typeof Home }> = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "squad", label: "Kaderuebersicht", icon: Users },
  { id: "grounds", label: "Vereinsgelaende", icon: Building2 },
  { id: "lineup", label: "Aufstellung", icon: Shield },
  { id: "matchday", label: "Spieltagsuebersicht", icon: CalendarDays },
  { id: "transfer", label: "Transfermarkt", icon: ShoppingCart },
  { id: "table", label: "Tabelle", icon: Trophy },
  { id: "prestige", label: "Prestige", icon: Medal },
  { id: "hall_of_fame", label: "Hall of Fame", icon: Award },
  { id: "settings", label: "Settings", icon: Settings },
];

const phaseMenu: Array<{ id: GameView; label: string; icon: typeof Home; phases: string[] }> = [
  { id: "draft", label: "Draft", icon: ClipboardList, phases: ["draft"] },
  { id: "training", label: "Training", icon: Dumbbell, phases: ["off_season", "offseason_training"] },
  { id: "scouting", label: "Scouting", icon: MapIcon, phases: ["off_season", "offseason_scouting"] },
  { id: "deadline", label: "Deadline Day", icon: Gavel, phases: ["deadline_day"] },
  { id: "continental", label: "Continental Cup", icon: Trophy, phases: ["champions_league"] },
];

export function GameDashboard(props: GameDashboardProps) {
  const storeSnapshot = useGameStore((state) => state.snapshot);

  useLayoutEffect(() => {
    hydrateGameStoreIfNewer(props.snapshot);
  }, [props.snapshot]);

  const snapshot = pickFresherSnapshot(props.snapshot, storeSnapshot);

  return <GameDashboardContent {...props} snapshot={snapshot} />;
}

function GameDashboardContent({ activeView, currentUserId, snapshot }: GameDashboardProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const view = normalizeView(activeView, snapshot.game.phase);
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
      <GameRealtimeBridge currentUserId={currentUserId} currentView={view} snapshot={snapshot} />
      <GameChangerPopup
        clubs={snapshot.clubs}
        gameId={snapshot.game.id}
        news={snapshot.match_news}
        ownClubId={ownClub?.id}
        pendingEffects={snapshot.club_overview?.pending_effects ?? []}
        roomCode={snapshot.game.room_code}
      />
      {(snapshot.club_overview?.pending_game_changer_choices ?? []).slice(0, 1).map((choice) => (
        <GameChangerChoiceModal
          key={choice.id}
          choice={choice}
          gameId={snapshot.game.id}
          roomCode={snapshot.game.room_code}
          squad={snapshot.club_overview?.squad ?? []}
        />
      ))}
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
          <FinalSeasonBanner game={snapshot.game} />
          {snapshot.game.phase === "off_season" && ownClub ? (
            <OffSeasonChecklist ownClub={ownClub} snapshot={snapshot} />
          ) : null}
          {snapshot.game.phase === "lobby" ? (
            <LobbySetupView ownClub={ownClub} snapshot={snapshot} />
          ) : (
            renderView(view, {
              currentTurnClub,
              isHost,
              ownClub,
              snapshot,
            })
          )}
        </section>
      </div>
      <GameEventsDock
        clubs={snapshot.clubs}
        gameId={snapshot.game.id}
        news={snapshot.match_news}
        ownClubId={ownClub?.id}
      />
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
          {snapshot.game.phase === "completed" ? (
            <MenuLink
              active={activeView === "game_end"}
              badge="Sieger"
              collapsed={collapsed}
              game={snapshot.game.room_code}
              item={{ id: "game_end", label: "Spielende", icon: Crown }}
            />
          ) : null}
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

        {isDevEnvironment() && isHost ? (
          <div className="mt-5 border-t border-zinc-800 pt-4">
            <DevAdminMenu
              collapsed={collapsed}
              hostOnly
              isHost={isHost}
              roomCode={snapshot.game.room_code}
              variant="sidebar"
            />
          </div>
        ) : null}

        <div className="mt-5 border-t border-zinc-800 pt-4">
          {collapsed ? (
            <div className="flex justify-center">
              <Badge>{snapshot.game.phase.slice(0, 2)}</Badge>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-900/70 px-3 py-2 text-sm">
                <span className="text-zinc-400">Phase</span>
                <Badge>{getPhaseLabel(snapshot.game.phase)}</Badge>
              </div>
              {isHost ? (
                <p className="mt-3 px-2 text-xs text-zinc-500">
                  Host-Tools sind oben rechts verfuegbar.
                  {isDevEnvironment() ? " Dev-Menue siehe Abschnitt unten." : null}
                </p>
              ) : null}
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

function OffSeasonChecklist({ ownClub, snapshot }: { ownClub: LobbyClub; snapshot: LobbySnapshot }) {
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
  const overview = snapshot.club_overview;

  // Training erledigt: alle Versuche aufgebraucht
  const trainingStatus = overview?.training.status;
  const trainingDone = trainingStatus
    ? trainingStatus.attempts_used >= trainingStatus.capacity_players
    : false;

  // Scouting erledigt: alle gezogenen Karten resolved und nichts mehr ziehbar
  const ownDraws = snapshot.scouting?.draws.filter((d) => d.club_id === ownClub.id) ?? [];
  const hasUnresolvedDraw = ownDraws.some((d) => d.status === "drawn");
  const scoutingStatus = snapshot.scouting?.status_by_club_id?.[ownClub.id];
  const scoutingCapacity = scoutingStatus?.capacity ?? 0;
  const scoutingDone = scoutingStatus?.finished ?? (!hasUnresolvedDraw && scoutingCapacity > 0 && ownDraws.length >= scoutingCapacity);

  // Investment erledigt: Eintrag in investments fuer aktuelle Saison existiert
  const investmentDone = (overview?.investments ?? []).some((inv) => inv.season_number === seasonNumber);

  const sponsorDone =
    Boolean(overview?.sponsor_contract) ||
    !overview?.sponsor_signing_allowed ||
    (overview?.available_sponsor_deals.length === 0 && (overview?.sponsor_history.length ?? 0) > 0);

  const items: Array<{ id: string; label: string; done: boolean; href: string; help: string }> = [
    {
      id: "training",
      label: "Training",
      done: trainingDone,
      href: `/games/${snapshot.game.room_code}?view=training`,
      help: trainingStatus
        ? `${trainingStatus.attempts_used}/${trainingStatus.capacity_players} Versuche genutzt`
        : "Trainingsstatus nicht verfuegbar",
    },
    {
      id: "scouting",
      label: "Scouting",
      done: scoutingDone,
      href: `/games/${snapshot.game.room_code}?view=scouting`,
      help: scoutingCapacity > 0
        ? `${ownDraws.length}/${scoutingCapacity} Karten gezogen${hasUnresolvedDraw ? " (offene Auswahl)" : ""}`
        : "Kein Scouting verfuegbar",
    },
    {
      id: "investment",
      label: "Investition",
      done: investmentDone,
      href: `/games/${snapshot.game.room_code}?view=grounds`,
      help: investmentDone ? "Investiert" : "Noch nicht investiert",
    },
    ...(overview?.sponsor_signing_allowed
      ? [
          {
            id: "sponsor",
            label: "Sponsor",
            done: sponsorDone,
            href: `/games/${snapshot.game.room_code}?view=grounds#sponsoring`,
            help: overview?.sponsor_contract
              ? "Vertrag aktiv"
              : `${overview?.available_sponsor_deals.length ?? 0} Deal(s) wählbar`,
          },
        ]
      : []),
  ];

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <div className="p-4">
        <p className="text-xs font-medium uppercase text-zinc-500">Off-Season Checkliste</p>
        <p className="mt-1 text-sm text-zinc-400">Bearbeite die drei Bereiche in beliebiger Reihenfolge. Wenn du fertig bist, druecke unten im Header auf &quot;Fertig&quot;.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {items.map((item) => (
            <Link
              className={cn(
                "flex items-center justify-between rounded-md border p-3 text-sm transition",
                item.done
                  ? "border-emerald-700/60 bg-emerald-950/30 hover:bg-emerald-950/50"
                  : "border-amber-700/60 bg-amber-950/20 hover:bg-amber-950/40",
              )}
              href={item.href}
              key={item.id}
            >
              <div>
                <p className="font-semibold text-zinc-100">{item.label}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{item.help}</p>
              </div>
              <Badge tone={item.done ? "green" : "amber"}>{item.done ? "erledigt" : "offen"}</Badge>
            </Link>
          ))}
        </div>
      </div>
    </Panel>
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
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
  const finalSeasonActive = isFinalSeason(snapshot.game.settings) && snapshot.game.phase !== "completed";

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
            {finalSeasonActive ? (
              <Badge tone="amber" title="Letzte Saison des Spiels">
                FINALE SAISON {seasonNumber}
              </Badge>
            ) : null}
            {snapshot.game.settings.final_season_number && !finalSeasonActive && snapshot.game.phase !== "completed" ? (
              <Badge tone="neutral" title="Finale Saison wurde ausgeloest">
                Finale ab S{snapshot.game.settings.final_season_number}
              </Badge>
            ) : null}
            {snapshot.game.phase === "completed" ? <Badge tone="green">Spiel beendet</Badge> : null}
            <Badge>{phaseDoneCount}/{phaseDoneTotal} fertig</Badge>
            <Badge>Save v{snapshot.game.save_version ?? 1}</Badge>
            <Badge tone={snapshot.game.settings.continental_cup_enabled === false ? "neutral" : "blue"}>
              Continental Cup {snapshot.game.settings.continental_cup_enabled === false ? "aus" : "an"}
            </Badge>
            <Badge tone={snapshot.game.settings.sponsoring_enabled === false ? "neutral" : "blue"}>
              Sponsoring {snapshot.game.settings.sponsoring_enabled === false ? "aus" : "an"}
            </Badge>
            <Badge tone={snapshot.game.settings.archetypes_enabled === false ? "neutral" : "blue"}>
              Archetypes {snapshot.game.settings.archetypes_enabled === false ? "aus" : "an"}
            </Badge>
            <ActiveEffectsChip
              effects={snapshot.club_overview?.pending_effects ?? []}
              roomCode={snapshot.game.room_code}
            />
            {ownClub && isClubStatusOverrideActive(ownClub, seasonNumber) ? (
              <Badge tone="green" title="Game-Changer-Status bis Saisonende">
                Status: {getEffectiveClubStatusLabel(ownClub, seasonNumber)}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-50">{ownClub?.club_name ?? "Spielstand"}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {ownClub?.club_slogan ? `${ownClub.club_slogan} - ` : ""}
            {currentTurnClub ? `${currentTurnClub.club_name} ist am Zug` : formatSavedLine(snapshot.game.last_saved_at)}
          </p>
          {ownClub ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Banknote size={14} className="text-zinc-500" aria-hidden />
                <span className="font-medium text-zinc-50">{formatMoney(ownClub.money)}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Sparkles size={14} className="text-zinc-500" aria-hidden />
                <span className="font-medium text-zinc-50">{formatStars(ownClub.squad_stars ?? 0)} Sterne</span>
              </span>
            </div>
          ) : null}
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
          {snapshot.game.phase === "completed" ? (
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-lime-300 px-4 text-sm font-medium text-zinc-950 transition hover:bg-lime-200"
              href={`/games/${snapshot.game.room_code}?view=game_end`}
            >
              <Crown size={16} aria-hidden />
              Spielende
            </Link>
          ) : null}
          {snapshot.game.phase !== "lobby" && snapshot.game.phase !== "completed" && ownMember ? (
            <form action={setPhaseDoneAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="done" type="hidden" value={ownMember.phase_done ? "false" : "true"} />
              <Button type="submit" variant={ownMember.phase_done ? "outline" : "primary"}>
                {ownMember.phase_done ? "Nicht fertig" : "Fertig"}
              </Button>
            </form>
          ) : null}
          {snapshot.game.phase !== "lobby" && snapshot.game.phase !== "completed" && isHost ? (
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
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="dashboard" />
      {snapshot.game.phase === "season_end" ? (
        <SeasonEndSummary isHost={isHost} ownClub={ownClub} snapshot={snapshot} />
      ) : null}
      {snapshot.prestige?.game_completed ? (
        <Panel className="border-amber-700/60 bg-amber-950/30">
          <PanelHeader>
            <div>
              <PanelTitle className="text-amber-100">Spiel beendet</PanelTitle>
              <PanelDescription>
                {snapshot.prestige.winner_club_name
                  ? `${snapshot.prestige.winner_club_name} gewinnt mit ${snapshot.prestige.clubs.find((club) => club.club_id === snapshot.prestige?.winner_club_id)?.prestige_points ?? 0} Prestige.`
                  : "Das Spiel ist abgeschlossen."}
              </PanelDescription>
            </div>
            <Crown size={18} className="text-amber-300" aria-hidden />
          </PanelHeader>
        </Panel>
      ) : snapshot.prestige?.enabled ? (
        <Panel className="border-[var(--club-border)] bg-zinc-950/85">
          <PanelHeader>
            <div>
              <PanelTitle>Prestige-Fortschritt</PanelTitle>
              <PanelDescription>
                Ziel: {snapshot.prestige.target} Prestige
                {snapshot.prestige.is_final_season ? " — finale Saison laeuft" : ""}
              </PanelDescription>
            </div>
            <Medal size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <p className="text-sm text-zinc-300">
            Dein Verein: {snapshot.prestige.clubs.find((club) => club.club_id === ownClub?.id)?.prestige_points ?? 0} /{" "}
            {snapshot.prestige.target} Prestige
          </p>
        </Panel>
      ) : null}

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
          <Metric
            icon={Target}
            label="Positionierung"
            value={`#${ownClub?.season_rank ?? 1}`}
            detail={getEffectiveClubStatusLabel(ownClub, seasonNumber)}
          />
          <Metric icon={ListOrdered} label="Am Zug" value={currentTurnClub?.club_name ?? getTurnFallback(snapshot.game.phase, isHost)} detail={snapshot.game.phase} />
        </div>
      </Panel>

      {snapshot.club_overview?.squad?.length ? (
        <PlayerHighlightsPanel roomCode={snapshot.game.room_code} squad={snapshot.club_overview.squad} />
      ) : null}

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

function SeasonEndSummary({
  isHost,
  ownClub,
  snapshot,
}: {
  isHost: boolean;
  ownClub: LobbyClub | undefined;
  snapshot: LobbySnapshot;
}) {
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
  const summary = buildSeasonEndSummaryModel({
    finance: snapshot.club_overview?.finance,
    matchNews: snapshot.match_news,
    ownClub,
    season: snapshot.season,
    settings: snapshot.game.settings,
  });
  const nextStepTitle = summary.goesToContinentalCup
    ? "Naechster Schritt: Continental Cup"
    : summary.continentalCupSkipped
      ? "Naechster Schritt: Off-Season (Cup entfaellt)"
      : "Naechster Schritt: Neue Off-Season";
  const nextStepText = summary.goesToContinentalCup
    ? summary.ownClubQualified
      ? "Du bist fuer den Continental Cup qualifiziert. Nach der Bestaetigung wechselt der Host ins Turnier."
      : "Kein qualifizierter Club von dir — der Continental Cup laeuft mit den anderen Teilnehmern und CPU-Teams."
    : summary.continentalCupSkipped
      ? "In dieser geraden Saison hat kein Club mindestens Mittleren Tabellenplatz erreicht. Der Cup wird uebersprungen."
      : `Nach der Bestaetigung startet Saison ${seasonNumber + 1} mit der Finanzphase der neuen Off-Season.`;

  if (!summary.hasSeasonData) {
    return (
      <Panel className="border-amber-800/70 bg-amber-950/20">
        <PanelHeader>
          <div>
            <PanelTitle>Saisonabschluss</PanelTitle>
            <PanelDescription>Saisonwertung wird geladen oder wurde noch nicht berechnet.</PanelDescription>
          </div>
          <Trophy size={18} className="text-amber-300" aria-hidden />
        </PanelHeader>
        <p className="text-sm text-amber-100/85">
          {summary.setupError ?? "Sobald die Saisonwertung verfuegbar ist, erscheinen hier Platzierungen, Ereignisse und der naechste Schritt."}
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/90">
      <PanelHeader>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PanelTitle>Saison abgeschlossen</PanelTitle>
            <Badge tone={summary.goesToContinentalCup ? "blue" : summary.continentalCupSkipped ? "neutral" : "green"}>
              {summary.goesToContinentalCup
                ? "Continental Cup folgt"
                : summary.continentalCupSkipped
                  ? "Cup entfaellt"
                  : "Off-Season folgt"}
            </Badge>
          </div>
          <PanelDescription>Saison {seasonNumber} ist ausgewertet. Markiere dich als Fertig, danach kann der Host fortsetzen.</PanelDescription>
        </div>
        <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CalendarDays} label="Saison" value={`#${seasonNumber}`} detail="abgeschlossen" />
        <Metric
          icon={Crown}
          label="Manager-Sieger"
          value={summary.topManagers[0]?.club_name ?? "-"}
          detail={summary.topManagers[0] ? `${summary.topManagers[0].season_score} Score` : "noch offen"}
        />
        <Metric
          icon={Trophy}
          label="Liga-Sieger"
          value={summary.leagueWinner?.participant.display_name ?? "-"}
          detail="kosmetische Saison-Tabelle"
        />
        <Metric
          icon={ListOrdered}
          label="Spiele"
          value={`${summary.completedFixtureCount}/${summary.totalFixtureCount}`}
          detail="abgeschlossen"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">Managerwertung</p>
              <p className="mt-1 text-sm text-zinc-400">Top 3 nach Siegpunkten aus Spielen gegen andere Manager.</p>
            </div>
            <Badge>Top 3</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {summary.topManagers.map((standing) => (
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3",
                  standing.club_id === ownClub?.id
                    ? "border-[var(--club-border)] bg-[var(--club-soft)]"
                    : "border-zinc-800 bg-zinc-950/50",
                )}
                key={standing.club_id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-sm font-semibold text-zinc-50">
                    #{standing.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-50">{standing.club_name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {standing.season_match_points} Siegpunkte (Manager-Spiele)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{standing.season_score} Score</Badge>
                  <Badge>{getClubStatusLabel(standing.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Dein Abschluss</p>
          {summary.ownStanding ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SmallInfo label="Platz" value={`#${summary.ownStanding.rank}`} />
                <SmallInfo label="Score" value={String(summary.ownStanding.season_score)} />
                <SmallInfo label="Status" value={getClubStatusLabel(summary.ownStanding.status)} />
                <SmallInfo label="Attraktivitaet" value={`${summary.ownStanding.attractiveness_stars} Sterne`} />
                <SmallInfo label="Kadersterne" value={String(summary.ownStanding.squad_stars)} />
                <SmallInfo label="Saisonpunkte" value={String(summary.ownStanding.season_match_points)} />
              </div>
              <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs font-medium uppercase text-zinc-500">Finance-Ausblick</p>
                <p className="mt-1 text-lg font-semibold text-zinc-50">{formatMoney(summary.finance?.projected_net ?? 0)}</p>
                <p className="mt-1 text-xs text-zinc-500">Stadion + Praemie minus Gehaelter, gebucht beim Start der Finance-Phase.</p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">Dein Verein ist in der Managerwertung noch nicht verfuegbar.</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Ereignisse</p>
          {summary.highlightNews.length > 0 ? (
            <div className="mt-3 space-y-2">
              {summary.highlightNews.map((news) => (
                <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3" key={news.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-zinc-100">{news.headline}</p>
                    <Badge tone={news.category === "injury" ? "red" : "blue"}>{news.category}</Badge>
                  </div>
                  {news.detail ? <p className="mt-1 text-sm text-zinc-400">{news.detail}</p> : null}
                  <p className="mt-2 text-xs text-zinc-600">{formatSavedAt(news.created_at)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">Keine Ereignisse fuer diese Saison geloggt.</p>
          )}
        </div>

        <div className="rounded-md border border-[var(--club-border)] bg-[var(--club-soft)] p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Naechster Schritt</p>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{nextStepTitle}</p>
          <p className="mt-2 text-sm text-zinc-400">{nextStepText}</p>
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/55 p-3 text-sm text-zinc-300">
            <p>
              {isHost
                ? "Alle Manager markieren oben Fertig. Sobald alle bereit sind, kannst du mit Fortsetzen wechseln."
                : "Markiere dich oben als Fertig. Sobald alle bereit sind, setzt der Host die Runde fort."}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Zielphase: {getPhaseLabel(summary.nextPhase)}</p>
          </div>
        </div>
      </div>
    </Panel>
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
      <div className="space-y-4">
        <ViewGuidePanel roomCode={snapshot.game.room_code} view="draft" />
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
      </div>
    );
  }

  const currentTurnClub = snapshot.clubs.find((club) => club.id === draft.current_club_id);
  const pickedPlayerIds = new Set(draft.picks.map((pick) => pick.playerId));
  const archetypesEnabled = snapshot.game.settings.archetypes_enabled !== false;
  const isMyTurn = Boolean(ownClub && draft.current_club_id === ownClub.id && snapshot.game.current_turn_club_id === ownClub.id);
  const ownSquadCount = ownClub ? draft.squad_counts[ownClub.id] ?? 0 : 0;
  const playerNames = new Map(draft.board_players.map((player) => [player.id, player.display_name]));
  const playerById = new Map(draft.board_players.map((player) => [player.id, player]));
  const clubNames = new Map(snapshot.clubs.map((club) => [club.id, club.club_name]));

  const clubPositionCounts: Record<string, ReturnType<typeof createEmptyDraftOverviewPositionCounts>> = {};
  for (const club of snapshot.clubs) {
    clubPositionCounts[club.id] = createEmptyDraftOverviewPositionCounts();
  }
  for (const pick of draft.picks) {
    const player = playerById.get(pick.playerId);
    if (!player || !clubPositionCounts[pick.clubId]) {
      continue;
    }
    const key = getDraftOverviewPositionKey(player);
    clubPositionCounts[pick.clubId][key] += 1;
  }

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="draft" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="board">
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
        <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="pool">
          <PanelHeader>
            <div>
              <PanelTitle>Verfuegbare Spieler</PanelTitle>
              <PanelDescription>
                {isMyTurn ? "Waehle eine Karte fuer deinen Kader." : `Wartet auf ${currentTurnClub?.club_name ?? "den naechsten Pick"}.`}
              </PanelDescription>
            </div>
            <ClipboardList size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          {archetypesEnabled ? <ArchetypeMatchupGuide className="mb-4" /> : null}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {draft.board_players.map((player) => {
              const card = mapDbPlayerToPlayerCardData(player);
              const picked = pickedPlayerIds.has(player.id);
              const canPick = isMyTurn && !picked;

              return (
                <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900/45 p-2", picked ? "opacity-55" : "")} key={player.id}>
                  <PlayerCard disabled={picked} player={card} showArchetypes={archetypesEnabled} variant="draft" />
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

        <div className="space-y-4">
          <Panel className="border-[var(--club-border)] bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Kaderstand</PanelTitle>
                <PanelDescription>Picks pro Position je Club</PanelDescription>
              </div>
              <Users size={18} className="text-[var(--club-color)]" aria-hidden />
            </PanelHeader>
            <div className="space-y-2">
              {snapshot.clubs.map((club) => {
                const counts = clubPositionCounts[club.id] ?? createEmptyDraftOverviewPositionCounts();
                const total = draft.squad_counts[club.id] ?? 0;
                const isOwn = club.id === ownClub?.id;
                return (
                  <div
                    key={club.id}
                    className={cn(
                      "rounded-md border p-3",
                      isOwn ? "border-[var(--club-color)] bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-zinc-200 truncate">{club.club_name}</p>
                      <span className="shrink-0 text-xs text-zinc-500">{total} Picks</span>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
                      {DRAFT_OVERVIEW_POSITIONS.map(({ key, label }) => (
                        <div
                          className={cn(
                            "rounded px-1 py-1",
                            key === "UTIL" ? "bg-violet-950/50" : "bg-zinc-800/70",
                          )}
                          key={key}
                        >
                          <p className={cn("font-medium", key === "UTIL" ? "text-violet-300" : "text-zinc-400")}>{label}</p>
                          <p
                            className={cn(
                              "font-bold",
                              counts[key] > 0
                                ? key === "UTIL"
                                  ? "text-violet-100"
                                  : "text-zinc-100"
                                : "text-zinc-600",
                            )}
                          >
                            {counts[key]}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="history">
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
                draft.picks.map((pick) => {
                  const player = playerById.get(pick.playerId);
                  const positionLabel = player
                    ? getDraftOverviewPositionKey(player) === "UTIL"
                      ? "UTIL"
                      : getPositionLabel(mapDbPlayerToPlayerCardData(player).positions)
                    : null;

                  return (
                    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={`${pick.clubId}-${pick.playerId}`}>
                      <p className="text-xs font-medium uppercase text-zinc-500">Pick {pick.pickIndex + 1}</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-100">{playerNames.get(pick.playerId) ?? "Spieler"}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {clubNames.get(pick.clubId) ?? "Club"}
                        {positionLabel ? ` · ${positionLabel}` : ""}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>
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
  const trainingEnabled = snapshot.game.phase === "off_season" || snapshot.game.phase === "offseason_training" || (isHost && testMode);
  const trainedClubPlayerIds = new Set(overview.training.events.map((event) => event.club_player_id));
  const latestEvents = [...overview.training.events].slice(0, 8);
  const diceCounts = [1, 2, 3, 4, 5, 6].map((roll) => ({
    count: overview.training.events.filter((event) => event.dice_roll === roll).length,
    roll,
  }));

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="training" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="center">
        <PanelHeader>
          <div>
            <PanelTitle>Trainingszentrum</PanelTitle>
            <PanelDescription>
              1W6 je Spieler: Bei Erfolg wird der Wurf zum neuen Sternwert (begrenzt durch max. Steigerung und Skill-Maximum).
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
              Regulär aktiv in der Off-Season. Host-Testmodus erlaubt Smoke-Tests im aktuellen Spielstand.
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
        <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="squad">
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
              {[...overview.squad]
                .sort((a, b) => {
                  const aStars = Math.trunc(Number(a.current_stars));
                  const bStars = Math.trunc(Number(b.current_stars));
                  const aTrainable = canTrainOwnedPlayer({
                    alreadyTrained: trainedClubPlayerIds.has(a.id),
                    attemptsUsed: status.attempts_used,
                    capacityPlayers: status.capacity_players,
                    currentStars: aStars,
                    injured: a.injured,
                    skillMax: Math.trunc(Number(a.player.skill_max ?? aStars)),
                  }).ok;
                  const bTrainable = canTrainOwnedPlayer({
                    alreadyTrained: trainedClubPlayerIds.has(b.id),
                    attemptsUsed: status.attempts_used,
                    capacityPlayers: status.capacity_players,
                    currentStars: bStars,
                    injured: b.injured,
                    skillMax: Math.trunc(Number(b.player.skill_max ?? bStars)),
                  }).ok;
                  if (aTrainable !== bTrainable) return aTrainable ? -1 : 1;
                  return aStars - bStars;
                })
                .map((owned) => {
                const card = mapOwnedPlayerToCardData(owned);
                const currentStars = Math.trunc(Number(owned.current_stars));
                const skillMax = resolvePlayerSkillDisplayMax({
                  baseStars: owned.player.base_stars,
                  currentStars,
                  potentialStars: owned.player.potential_stars,
                  skillMax: owned.player.skill_max,
                });
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
                    <PlayerCard disabled={owned.injured} player={card} showArchetypes={snapshot.game.settings.archetypes_enabled !== false} variant="draft" />
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

        <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="log">
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
                const presentation = getTrainingEventPresentation({
                  ...event,
                  nlzOrigin: owned ? isNlzOriginPlayer(owned.player.metadata) : false,
                });

                return (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={event.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{owned ? getClubPlayerDisplayName(owned) : "Spieler"}</p>
                        <p className="mt-1 text-xs text-zinc-500">{formatSavedAt(event.created_at)}</p>
                      </div>
                      <Badge tone={presentation.badgeTone}>Wurf {event.dice_roll}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">
                      {formatStars(event.before_stars)} {"->"} {formatStars(event.after_stars)} Sterne
                      {presentation.detailSuffix}
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
              Jeder Wurf hat 16,7 Prozent. Fortschritt entsteht nur, wenn der Wurf ueber dem aktuellen Sternwert liegt; der neue Wert ist der Wurf, begrenzt durch max. Steigerung (+Trainingslevel) und Skill-Maximum. Ab Trainingslevel 4 rettet ein Bonus den ersten Fehlwurf (+1 Stern). NLZ-Talente mit Akademie Level 3+ erhalten bei einem Fehlwurf ebenfalls +1 Stern.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ScoutingView({ isHost, ownClub, snapshot }: { isHost: boolean; ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const searchParams = useSearchParams();
  const scoutingError = searchParams.get("scouting_error");
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
          Scouting ist aktiv in der Off-Season.
        </div>
      </Panel>
    );
  }

  const ownStatus = scouting.status_by_club_id[ownClub.id];
  const ownDraws = scouting.draws.filter((draw) => draw.club_id === ownClub.id);
  const ownOpenDraws = ownDraws.filter((draw) => draw.status === "drawn");
  const allOwnCardsDrawn = ownStatus.draw_count >= ownStatus.capacity;
  const ownFinished = allOwnCardsDrawn && ownOpenDraws.length === 0;
  const finishedCount = Object.values(scouting.status_by_club_id).filter((s) => s.finished).length;
  const totalCount = snapshot.clubs.length;
  const drawCheck = canDrawScoutingPlayer({
    drawnCount: ownStatus.draw_count,
    ownClubId: ownClub.id,
    scoutingCapacity: ownStatus.capacity,
  });
  const canDraw = drawCheck.ok;

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="scouting" />
      {scoutingError ? (
        <div className="rounded-md border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-100">
          Kauf nicht moeglich: {getScoutingActionLabel(scoutingError)}
        </div>
      ) : null}
      {scouting.all_finished ? (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-100">Alle Clubs haben gescoutet</p>
              <p className="mt-1 text-xs text-emerald-200/75">Der Host kann die Phase jetzt fortsetzen.</p>
            </div>
            {isHost ? (
              <form action={advancePhaseAction}>
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <Button type="submit">
                  <ListOrdered size={16} aria-hidden />
                  Phase fortsetzen
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="network">
        <PanelHeader>
          <div>
            <PanelTitle>Scouting Network</PanelTitle>
            <PanelDescription>Ziehe Karten, kaufe oder passe — alle Clubs spielen gleichzeitig.</PanelDescription>
          </div>
          <MapIcon size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric detail="Clubs abgeschlossen" icon={ListOrdered} label="Fortschritt" value={`${finishedCount}/${totalCount}`} />
          <Metric detail="Vereinsgelaende" icon={Eye} label="Scouting Level" value={`${ownClub.scouting_level ?? 1}/4`} />
          <Metric detail="eigene Ziehungen" icon={ClipboardList} label="Gezogen" value={`${ownStatus.draw_count}/${ownStatus.capacity}`} />
          <Metric detail="offene Entscheidungen" icon={ShoppingCart} label="Auslage" value={`${ownOpenDraws.length}`} />
          <Metric detail="im Transfermarkt" icon={UserMinus} label="Verkaeufe" value={`${ownStatus.sales_count}/2`} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel className="overflow-hidden border-[var(--club-border)] bg-zinc-950/85" id="draws">
          <PanelHeader>
            <div>
              <PanelTitle>The World of Scouting</PanelTitle>
              <PanelDescription>
                {ownFinished ? "Du hast alle Karten gezogen und entschieden." : allOwnCardsDrawn ? "Entscheide ueber deine Auslage." : "Waehle einen Stapel fuer die naechste Karte."}
              </PanelDescription>
            </div>
            <Badge tone={ownFinished ? "blue" : canDraw ? "green" : "neutral"}>{ownStatus.draw_count}/{ownStatus.capacity}</Badge>
          </PanelHeader>
          <div className="relative overflow-hidden rounded-lg border border-emerald-900/70 bg-[radial-gradient(circle_at_50%_45%,rgba(16,185,129,0.20),transparent_21rem),linear-gradient(135deg,#07110d,#071522_58%,#050609)] p-4">
            <div className="pointer-events-none absolute left-[16%] top-[28%] h-20 w-32 rounded-full border border-emerald-500/20 bg-emerald-400/5 blur-sm" />
            <div className="pointer-events-none absolute right-[18%] top-[42%] h-28 w-36 rounded-full border border-sky-500/20 bg-sky-400/5 blur-sm" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SCOUTING_PILES.map((pile, index) => (
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
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="progress">
          <PanelHeader>
            <div>
              <PanelTitle>Fortschritt</PanelTitle>
              <PanelDescription>Erst ziehen, dann kaufen oder passen.</PanelDescription>
            </div>
            <ListOrdered size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          <div className="space-y-3">
            {snapshot.clubs.map((club) => {
              const status = scouting.status_by_club_id[club.id];
              const isOwn = club.id === ownClub.id;

              return (
                <div className={cn("rounded-md border p-3", isOwn ? "border-[var(--club-border)] bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/40")} key={club.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn("text-sm font-semibold", isOwn ? "text-[var(--club-color)]" : "text-zinc-100")}>{club.club_name}</p>
                    <Badge tone={status?.finished ? "blue" : "neutral"}>
                      {status?.finished ? "fertig" : "laeuft"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {status?.draw_count ?? 0}/{status?.capacity ?? 0} gezogen · {status?.bought_count ?? 0} gekauft · {status?.passed_count ?? 0} gepasst
                  </p>
                </div>
              );
            })}
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
  const ownStatus = scouting.status_by_club_id[ownClub.id];
  const ownDraws = scouting.draws.filter((draw) => draw.club_id === ownClub.id);
  const allOwnCardsDrawn = ownStatus.draw_count >= ownStatus.capacity;
  const ownOpenDraws = ownDraws.filter((d) => d.status === "drawn");
  const canPassAll = allOwnCardsDrawn && ownOpenDraws.length > 1;

  // Order clubs: own first, then others alphabetically
  const orderedClubs = [
    ownClub,
    ...snapshot.clubs.filter((c) => c.id !== ownClub.id).sort((a, b) => a.club_name.localeCompare(b.club_name)),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Scouting-Auslagen</p>
          <p className="text-xs text-zinc-500">Jeder Verein hat seine eigene Auslage.</p>
        </div>
        <div className="flex items-center gap-3">
          {canPassAll ? (
            <form action={passAllScoutedPlayersAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <Button size="sm" type="submit" variant="outline">
                <X size={13} aria-hidden />
                Rest passen ({ownOpenDraws.length})
              </Button>
            </form>
          ) : null}
          <Eye size={18} className="text-zinc-500" aria-hidden />
        </div>
      </div>

      {orderedClubs.map((club) => {
        const isOwn = club.id === ownClub.id;
        const clubDraws = scouting.draws.filter((d) => d.club_id === club.id);
        const clubStatus = scouting.status_by_club_id[club.id];

        return (
          <Panel
            className={cn(
              "overflow-hidden",
              isOwn ? "border-[var(--club-border)] bg-zinc-950/85" : "border-zinc-800 bg-zinc-900/40",
            )}
            key={club.id}
          >
            <PanelHeader>
              <div>
                <PanelTitle className={isOwn ? "text-[var(--club-color)]" : undefined}>
                  {club.club_name}
                  {isOwn ? " (Du)" : ""}
                </PanelTitle>
                <PanelDescription>
                  {clubStatus?.draw_count ?? 0}/{clubStatus?.capacity ?? 0} gezogen · {clubStatus?.bought_count ?? 0} gekauft · {clubStatus?.passed_count ?? 0} gepasst
                </PanelDescription>
              </div>
              <Badge tone={clubStatus?.finished ? "blue" : "neutral"}>
                {clubStatus?.finished ? "fertig" : "laeuft"}
              </Badge>
            </PanelHeader>

            {clubDraws.length === 0 ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-xs text-zinc-500">
                Noch keine Karten gezogen.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {clubDraws.map((draw) => {
                  const card = mapDbPlayerToPlayerCardData(draw.player);
                  const pendingEffects = overview.pending_effects ?? [];
                  const purchasePrice = getScoutingPurchasePrice(card.market.scoutingFee * 1_000_000, pendingEffects);
                  const buyCheck = canBuyScoutedPlayer({
                    drawnCount: ownDraws.length,
                    money: overview.finance.money,
                    ownClubId: ownClub.id,
                    playerPrice: purchasePrice,
                    scoutingCapacity: ownStatus.capacity,
                    squadSize: overview.squad.length,
                    transfersBlocked: isOffseasonTransfersBlocked(pendingEffects, snapshot.game.phase),
                  });
                  const resolveCheck = canResolveScoutedPlayer({
                    drawnCount: ownDraws.length,
                    ownClubId: ownClub.id,
                    scoutingCapacity: ownStatus.capacity,
                  });
                  const canBuy = isOwn && draw.status === "drawn" && buyCheck.ok;
                  const canPass = isOwn && draw.status === "drawn" && resolveCheck.ok;

                  return (
                    <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900/45 p-2", draw.status !== "drawn" ? "opacity-60" : "")} key={draw.id}>
                      <div className="mb-2">
                        <Badge tone={draw.status === "bought" ? "green" : draw.status === "passed" ? "red" : "blue"}>{draw.status}</Badge>
                      </div>
                      <PlayerCard disabled={draw.status !== "drawn"} player={card} showArchetypes={snapshot.game.settings.archetypes_enabled !== false} variant="draft" />
                      {isOwn && draw.status === "drawn" ? (
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
      })}
    </div>
  );
}

function TransferMarketView({ ownClub, snapshot }: { ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const overview = snapshot.club_overview;
  const transferMarket = snapshot.transfer_market;

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
  const squadSize = overview.squad.length;
  const squadOverCapacity = squadSize > MAX_SQUAD_SIZE;
  const isOffseason = isOffseasonPhase(snapshot.game.phase);
  const saleCheck = canSellClubPlayer({ isOffseason, salesCount, squadSize });
  const isReleaseMode = saleCheck.ok && saleCheck.mode === "release";
  const transfersBlocked = isOffseasonTransfersBlocked(overview.pending_effects ?? [], snapshot.game.phase);
  const managerDeparturesCount = transferMarket?.manager_departures_count ?? 0;
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
  const poachingEnabled = isOffseason && !transfersBlocked && !transferMarket?.poach_setup_error;

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="transfer" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Transfermarkt</PanelTitle>
            <PanelDescription>Verkaufe Spieler an den Pool und verwalte offene Manager-Angebote.</PanelDescription>
          </div>
          <ShoppingCart size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric detail="aktueller Kontostand" icon={Banknote} label="Budget" value={formatMoney(overview.finance.money)} />
          <Metric detail="Pool-Verkaufslimit" icon={UserMinus} label="Verkaeufe" value={`${salesCount}/2`} />
          <Metric detail="Manager-Transferlimit" icon={ArrowLeftRight} label="Manager-Abgaenge" value={`${managerDeparturesCount}/${MANAGER_TRANSFER_DEPARTURE_LIMIT}`} />
          <Metric detail={transfersBlocked ? "Game-Changer-Sperre" : isOffseason ? "Transfers aktiv" : "nur Offseason"} icon={CalendarDays} label="Phase" value={snapshot.game.phase} />
        </div>
      </Panel>

      {transferMarket?.setup_error ? (
        <Panel className="border-amber-700 bg-amber-950/25">
          <PanelHeader>
            <div>
              <PanelTitle>Manager-Transfers nicht bereit</PanelTitle>
              <PanelDescription>{transferMarket.setup_error}</PanelDescription>
            </div>
            <Gavel size={18} className="text-amber-200" aria-hidden />
          </PanelHeader>
        </Panel>
      ) : null}

      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="pool">
        <PanelHeader>
          <div>
            <PanelTitle>Eigener Kader</PanelTitle>
            <PanelDescription>
              {squadOverCapacity
                ? `${squadSize} / ${MAX_SQUAD_SIZE} Spieler · ${squadSize - MAX_SQUAD_SIZE} Entlassung(en) noetig`
                : `${squadSize} / ${MAX_SQUAD_SIZE} Spieler · ${MAX_SQUAD_SIZE - squadSize} Plätze frei`}
            </PanelDescription>
          </div>
          <Users size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone={isReleaseMode ? "amber" : saleCheck.ok ? "green" : "red"}>
            {isReleaseMode ? "Entlassungen noetig" : saleCheck.ok ? "Verkauf moeglich" : getScoutingCheckLabel(saleCheck)}
          </Badge>
          <Badge tone={squadOverCapacity ? "red" : squadSize >= MAX_SQUAD_SIZE ? "amber" : "neutral"}>
            {squadSize} / {MAX_SQUAD_SIZE} Spieler
          </Badge>
        </div>
        {overview.squad.length > 0 ? <div className="mb-4"><SquadPositionBreakdown squad={overview.squad} /></div> : null}
        {overview.squad.length === 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">Keine Spieler im Kader.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {[...overview.squad]
              .sort((a, b) => {
                const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
                const posA = posOrder[a.player.position] ?? 4;
                const posB = posOrder[b.player.position] ?? 4;
                if (posA !== posB) return posA - posB;
                return Number(b.current_stars) - Number(a.current_stars);
              })
              .map((owned) => {
              const card = mapOwnedPlayerToCardData(owned);
              const positionLabel = getPlayerPositionLabel(owned.player);
              const currentStars = Number(owned.current_stars);
              const maxStars = Number(owned.player.skill_max ?? card.skill.max);
              const salePayout = squadOverCapacity ? 0 : getCardScoutingMoney(card.market);
              const purchasePrice = owned.purchase_price ?? null;
              const poolProfit = purchasePrice != null ? salePayout - purchasePrice : null;
              const isUnavailable = isPlayerUnavailableForSeason(seasonNumber, owned.unavailable_until_season);
              const poolProfitLabel =
                poolProfit == null ? "—" : `${poolProfit > 0 ? "+" : ""}${formatMoney(poolProfit)}`;
              const poolProfitClassName =
                poolProfit == null
                  ? "text-zinc-500"
                  : isQualifiedTransferProfit(salePayout, purchasePrice)
                    ? "text-lime-300"
                    : poolProfit > 0
                      ? "text-emerald-300"
                      : poolProfit < 0
                        ? "text-red-400"
                        : "text-zinc-500";

              return (
                <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/55 p-3 sm:grid-cols-[132px_minmax(0,1fr)]" key={owned.id}>
                  <PlayerCard disabled={owned.injured || isUnavailable} player={card} showArchetypes={snapshot.game.settings.archetypes_enabled !== false} variant="draft" />
                  <div className="flex min-w-0 flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-zinc-50">{getClubPlayerDisplayName(owned)}</p>
                          <p className="mt-1 text-sm text-zinc-400">{positionLabel}</p>
                        </div>
                        <Badge tone={isUnavailable ? "amber" : owned.injured ? "red" : "green"}>
                          {isUnavailable ? "gesperrt (Saison)" : owned.injured ? "verletzt" : "fit"}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-3">
                        <SmallInfo label="Staerke" value={`${formatStars(currentStars)} / ${formatStars(maxStars)}`} />
                        <SmallInfo label="Zone" value={owned.current_zone} />
                        <SmallInfo label="Kaufpreis" value={purchasePrice != null ? formatMoney(purchasePrice) : "—"} />
                        <SmallInfo label="Transfer Value" value={formatMoney(getCardTransferMoney(card.market))} />
                        <SmallInfo
                          label={squadOverCapacity ? "Entlassung" : "Scouting Value"}
                          value={squadOverCapacity ? formatMoney(0) : formatMoney(getCardScoutingMoney(card.market))}
                        />
                        <SmallInfo label="Pot. Gewinn" value={poolProfitLabel} valueClassName={poolProfitClassName} />
                      </div>
                    </div>
                    <form action={sellClubPlayerAction}>
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="club_player_id" type="hidden" value={owned.id} />
                      <input name="return_view" type="hidden" value="transfer" />
                      <Button disabled={!saleCheck.ok} size="sm" type="submit" variant={isReleaseMode ? "secondary" : "outline"}>
                        <UserMinus size={14} aria-hidden />
                        {isReleaseMode ? `Spieler entlassen (${formatMoney(salePayout)})` : "Spieler verkaufen"}
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
        <Panel className="border-zinc-800 bg-zinc-950/75" id="incoming">
          <PanelHeader>
            <div>
              <PanelTitle>Eingehende Angebote</PanelTitle>
              <PanelDescription>Akzeptiere oder lehne offene Anfragen anderer Manager ab.</PanelDescription>
            </div>
            <Gavel size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          {!transferMarket || transferMarket.incoming_offers.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
              Keine eingehenden Angebote.
            </div>
          ) : (
            <div className="space-y-3">
              {transferMarket.incoming_offers.map((offer) => (
                <TransferOfferCard direction="incoming" key={offer.id} offer={offer} snapshot={snapshot} />
              ))}
            </div>
          )}
        </Panel>
        <Panel className="border-zinc-800 bg-zinc-950/75" id="outgoing">
          <PanelHeader>
            <div>
              <PanelTitle>Ausgehende Anfragen</PanelTitle>
              <PanelDescription>Offene Angebote, die du zurueckziehen kannst.</PanelDescription>
            </div>
            <ShoppingCart size={18} className="text-[var(--club-color)]" aria-hidden />
          </PanelHeader>
          {!transferMarket || transferMarket.outgoing_offers.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
              Keine ausgehenden Angebote.
            </div>
          ) : (
            <div className="space-y-3">
              {transferMarket.outgoing_offers.map((offer) => (
                <TransferOfferCard direction="outgoing" key={offer.id} offer={offer} snapshot={snapshot} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {transferMarket?.poach_setup_error ? (
        <Panel className="border-amber-700 bg-amber-950/25">
          <PanelHeader>
            <div>
              <PanelTitle>Abwerbungen nicht bereit</PanelTitle>
              <PanelDescription>{transferMarket.poach_setup_error}</PanelDescription>
            </div>
            <Target size={18} className="text-amber-200" aria-hidden />
          </PanelHeader>
        </Panel>
      ) : (
        <>
          <Panel className="border-zinc-800 bg-zinc-950/75" id="poaching">
            <PanelHeader>
              <div>
                <PanelTitle>Abwerbung unzufriedener Spieler</PanelTitle>
                <PanelDescription>
                  Nur in der Offseason. Dein Vereinsstatus ({transferMarket?.attractiveness_stars ?? ownClub.attractiveness_stars ?? 3} Sterne) erlaubt Abwerbungen von Spielern, die beim Gegner ueber seinem Status liegen.
                </PanelDescription>
              </div>
              <Target size={18} className="text-[var(--club-color)]" aria-hidden />
            </PanelHeader>
            {!poachingEnabled ? (
              <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
                Abwerbungen sind aktuell nicht moeglich.
              </div>
            ) : !transferMarket || transferMarket.poachable_clubs.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
                Aktuell keine abwerbbaren Spieler bei anderen Managern.
              </div>
            ) : (
              <div className="space-y-4">
                {transferMarket.poachable_clubs.map((entry) => (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3" key={entry.club.id}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-zinc-100">{entry.club.club_name}</p>
                        <p className="text-xs text-zinc-500">{entry.club.manager_name} · Status {entry.attractiveness_stars} Sterne</p>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {entry.players.map((player) => (
                        <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3" key={player.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-zinc-100">{getClubPlayerDisplayName(player)}</p>
                              <p className="text-xs text-zinc-500">{formatStars(Number(player.current_stars))} Sterne</p>
                            </div>
                          </div>
                          <form action={createPoachRequestAction} className="mt-3 flex flex-wrap items-end gap-2">
                            <input name="game_id" type="hidden" value={snapshot.game.id} />
                            <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                            <input name="target_club_player_id" type="hidden" value={player.id} />
                            <label className="text-xs text-zinc-400">
                              Gebot (Mio.)
                              <input
                                className="mt-1 block w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                                defaultValue={2}
                                min={1}
                                name="cash_amount_millions"
                                step={1}
                                type="number"
                              />
                            </label>
                            <Button size="sm" type="submit" variant="outline">
                              Abwerben
                            </Button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel className="border-zinc-800 bg-zinc-950/75" id="poach-incoming">
              <PanelHeader>
                <div>
                  <PanelTitle>Eingehende Abwerbungen</PanelTitle>
                  <PanelDescription>Ablehnung sperrt den Spieler fuer die kommende Saison auf der Bank.</PanelDescription>
                </div>
                <Gavel size={18} className="text-[var(--club-color)]" aria-hidden />
              </PanelHeader>
              {!transferMarket || transferMarket.incoming_poach_requests.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
                  Keine eingehenden Abwerbungen.
                </div>
              ) : (
                <div className="space-y-3">
                  {transferMarket.incoming_poach_requests.map((request) => (
                    <PoachRequestCard direction="incoming" key={request.id} request={request} snapshot={snapshot} />
                  ))}
                </div>
              )}
            </Panel>
            <Panel className="border-zinc-800 bg-zinc-950/75" id="poach-outgoing">
              <PanelHeader>
                <div>
                  <PanelTitle>Ausgehende Abwerbungen</PanelTitle>
                  <PanelDescription>Offene Anfragen an schwaecher eingestufte Vereine.</PanelDescription>
                </div>
                <Target size={18} className="text-[var(--club-color)]" aria-hidden />
              </PanelHeader>
              {!transferMarket || transferMarket.outgoing_poach_requests.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/45 p-4 text-sm text-zinc-500">
                  Keine ausgehenden Abwerbungen.
                </div>
              ) : (
                <div className="space-y-3">
                  {transferMarket.outgoing_poach_requests.map((request) => (
                    <PoachRequestCard direction="outgoing" key={request.id} request={request} snapshot={snapshot} />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function PoachRequestCard({
  direction,
  request,
  snapshot,
}: {
  direction: "incoming" | "outgoing";
  request: PoachRequestSnapshot;
  snapshot: LobbySnapshot;
}) {
  const targetPlayer = request.target_club_player;
  const targetName = targetPlayer ? getClubPlayerDisplayName(targetPlayer) : "Spieler";
  const counterparty = direction === "incoming" ? request.from_club.club_name : request.to_club.club_name;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-100">{targetName}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {direction === "incoming" ? "Anfrage von" : "Anfrage an"} {counterparty}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Gebot: {formatMoney(request.cash_amount)}</p>
        </div>
        {targetPlayer ? (
          <Badge tone="blue">{formatStars(Number(targetPlayer.current_stars))} Sterne</Badge>
        ) : null}
      </div>
      {direction === "incoming" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-300">
            Bei Ablehnung sitzt der Spieler die kommende Saison gesperrt auf der Bank.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={acceptPoachRequestAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="request_id" type="hidden" value={request.id} />
              <Button size="sm" type="submit" variant="primary">
                Annehmen
              </Button>
            </form>
            <form action={declinePoachRequestAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="request_id" type="hidden" value={request.id} />
              <Button size="sm" type="submit" variant="outline">
                Ablehnen
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <form action={cancelPoachRequestAction} className="mt-3">
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <input name="request_id" type="hidden" value={request.id} />
          <Button size="sm" type="submit" variant="outline">
            Zurueckziehen
          </Button>
        </form>
      )}
    </div>
  );
}

function TransferOfferCard({
  direction,
  offer,
  snapshot,
}: {
  direction: "incoming" | "outgoing";
  offer: TransferOfferSnapshot;
  snapshot: LobbySnapshot;
}) {
  const [counterOffer, setCounterOffer] = useState(false);
  const archetypesEnabled = snapshot.game.settings.archetypes_enabled !== false;
  const targetPlayer = offer.target_club_player;
  const offeredPlayer = offer.offered_club_player;
  const targetName = targetPlayer ? getClubPlayerDisplayName(targetPlayer) : "Spieler";
  const counterparty = direction === "incoming" ? offer.from_club.club_name : offer.to_club.club_name;
  const canCounterOffer = direction === "incoming" && !offer.parent_offer_id && (offer.responder_club_id ?? offer.to_club_id) === offer.to_club_id;
  const counterOfferPlayers = getCounterOfferSwapPlayers(snapshot, offer);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-50">{counterparty}</p>
          <p className="mt-1 text-xs text-zinc-500">{formatSavedAt(offer.created_at)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {offer.parent_offer_id ? <Badge tone="blue">Gegenangebot</Badge> : null}
          <Badge tone="amber">offen</Badge>
        </div>
      </div>
      {offeredPlayer && targetPlayer ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {direction === "incoming" ? "Dein Spieler" : "Angefragt"}
            </p>
            <PlayerCard
              disabled={targetPlayer.injured}
              player={mapOwnedPlayerToCardData(targetPlayer)}
              showArchetypes={archetypesEnabled}
              variant="draft"
            />
            <p className="mt-2 text-xs text-zinc-400">{formatTransferPlayerMeta(targetPlayer)}</p>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 px-1 text-zinc-500">
            <ArrowLeftRight size={16} aria-hidden />
            {offer.cash_amount > 0 ? (
              <p className="text-center text-xs font-semibold text-lime-300">+ {formatMoney(offer.cash_amount)}</p>
            ) : null}
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {direction === "incoming" ? "Im Tausch angeboten" : "Dein Spieler im Tausch"}
            </p>
            <PlayerCard
              disabled={offeredPlayer.injured}
              player={mapOwnedPlayerToCardData(offeredPlayer)}
              showArchetypes={archetypesEnabled}
              variant="draft"
            />
            <p className="mt-2 text-xs text-zinc-400">{formatTransferPlayerMeta(offeredPlayer)}</p>
            {offeredPlayer.injured ? (
              <Badge className="mt-2 w-fit" tone="red">
                verletzt
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
          <SmallInfo label="Angefragt" value={targetName} />
          <SmallInfo label="Position / Staerke" value={formatTransferPlayerMeta(targetPlayer)} />
          <SmallInfo label="Geld" value={formatMoney(offer.cash_amount)} />
          <SmallInfo label="Von" value={offer.from_club.club_name} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {direction === "incoming" ? (
          <>
            <form action={acceptTransferOfferAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="offer_id" type="hidden" value={offer.id} />
              <Button size="sm" type="submit" variant="primary">
                <UserCheck size={14} aria-hidden />
                Annehmen
              </Button>
            </form>
            <form action={declineTransferOfferAction}>
              <input name="game_id" type="hidden" value={snapshot.game.id} />
              <input name="room_code" type="hidden" value={snapshot.game.room_code} />
              <input name="offer_id" type="hidden" value={offer.id} />
              <Button size="sm" type="submit" variant="outline">
                <X size={14} aria-hidden />
                Ablehnen
              </Button>
            </form>
            {canCounterOffer && targetPlayer ? (
              <Button onClick={() => setCounterOffer(true)} size="sm" type="button" variant="secondary">
                <ArrowLeftRight size={14} aria-hidden />
                Gegenangebot
              </Button>
            ) : null}
          </>
        ) : (
          <form action={cancelTransferOfferAction}>
            <input name="game_id" type="hidden" value={snapshot.game.id} />
            <input name="room_code" type="hidden" value={snapshot.game.room_code} />
            <input name="offer_id" type="hidden" value={offer.id} />
            <Button size="sm" type="submit" variant="outline">
              <X size={14} aria-hidden />
              Zurueckziehen
            </Button>
          </form>
        )}
      </div>
      {counterOffer && targetPlayer ? (
        <CounterTransferOfferModal
          offer={offer}
          offerPlayers={counterOfferPlayers}
          onClose={() => setCounterOffer(false)}
          snapshot={snapshot}
          target={targetPlayer}
        />
      ) : null}
    </div>
  );
}

function getCounterOfferSwapPlayers(snapshot: LobbySnapshot, offer: TransferOfferSnapshot) {
  const clubSquad = snapshot.club_squads?.find((clubSquad) => clubSquad.club.id === offer.from_club_id)?.squad;
  const transferMarketSquad = snapshot.transfer_market?.other_clubs.find((club) => club.club.id === offer.from_club_id)?.squad;
  const squad = clubSquad ?? transferMarketSquad ?? [];
  const reservedOfferPlayerIds = new Set(
    [
      ...(snapshot.transfer_market?.incoming_offers ?? []),
      ...(snapshot.transfer_market?.outgoing_offers ?? []),
    ].flatMap((openOffer) => openOffer.id !== offer.id && openOffer.offered_club_player_id ? [openOffer.offered_club_player_id] : []),
  );

  return squad.filter((player) => !reservedOfferPlayerIds.has(player.id));
}

function CounterTransferOfferModal({
  offer,
  offerPlayers,
  onClose,
  snapshot,
  target,
}: {
  offer: TransferOfferSnapshot;
  offerPlayers: ClubPlayerSnapshot[];
  onClose: () => void;
  snapshot: LobbySnapshot;
  target: ClubPlayerSnapshot;
}) {
  const initialOfferedPlayerId =
    offer.offered_club_player_id && offerPlayers.some((clubPlayer) => clubPlayer.id === offer.offered_club_player_id)
      ? offer.offered_club_player_id
      : "none";
  const [offeredPlayerId, setOfferedPlayerId] = useState(initialOfferedPlayerId);
  const archetypesEnabled = snapshot.game.settings.archetypes_enabled !== false;
  const defaultCashMillions = Math.max(0, Math.round(Number(offer.cash_amount) / 1_000_000));
  const selectedOfferPlayer =
    offeredPlayerId === "none" ? null : (offerPlayers.find((clubPlayer) => clubPlayer.id === offeredPlayerId) ?? null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-zinc-50">Gegenangebot senden</p>
            <p className="mt-1 text-sm text-zinc-400">
              Der angefragte Spieler bleibt fix. Du veraenderst nur Geldbetrag und optionalen Tauschspieler.
            </p>
          </div>
          <Button className="h-8 px-2" onClick={onClose} type="button" variant="outline">
            <X size={15} aria-hidden />
          </Button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dein Spieler</p>
            <PlayerCard
              disabled={target.injured}
              player={mapOwnedPlayerToCardData(target)}
              showArchetypes={archetypesEnabled}
              variant="draft"
            />
            <p className="mt-2 text-xs text-zinc-400">{formatTransferPlayerMeta(target)}</p>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 px-1 pt-8 text-zinc-500">
            <ArrowLeftRight size={18} aria-hidden />
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Spieler von {offer.from_club.club_name}
            </p>
            {selectedOfferPlayer ? (
              <>
                <PlayerCard
                  disabled={selectedOfferPlayer.injured}
                  player={mapOwnedPlayerToCardData(selectedOfferPlayer)}
                  showArchetypes={archetypesEnabled}
                  variant="draft"
                />
                <p className="mt-2 text-xs text-zinc-400">{formatTransferPlayerMeta(selectedOfferPlayer)}</p>
              </>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950/60 px-4 text-center text-xs text-zinc-500">
                Optional unten einen Spieler des Bieters auswaehlen
              </div>
            )}
          </div>
        </div>

        <form action={counterTransferOfferAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <input name="offer_id" type="hidden" value={offer.id} />
          <label className="grid gap-1 text-xs text-zinc-400">
            Geldbetrag in Mio
            <input
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300"
              defaultValue={defaultCashMillions}
              min={0}
              name="cash_amount_millions"
              step={1}
              type="number"
            />
          </label>
          <label className="grid gap-1 text-xs text-zinc-400">
            Tauschspieler vom Bieter optional
            <select
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300"
              name="offered_club_player_id"
              onChange={(event) => setOfferedPlayerId(event.target.value)}
              value={offeredPlayerId}
            >
              <option value="none">Kein Spieler</option>
              {offerPlayers.map((clubPlayer) => (
                <option key={clubPlayer.id} value={clubPlayer.id}>
                  {getClubPlayerDisplayName(clubPlayer)} ({formatTransferPlayerMeta(clubPlayer)})
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2">
            <Button onClick={onClose} type="button" variant="outline">
              Abbrechen
            </Button>
            <Button type="submit" variant="primary">
              <ArrowLeftRight size={14} aria-hidden />
              Gegenangebot senden
            </Button>
          </div>
        </form>
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
  const displayMinimumBid = activeAuction ? getCatalogMinimumBidFromPlayer(activeAuction.player) : 0;
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
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="deadline" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="overview">
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" id="active">
          <Panel className="border-[var(--club-border)] bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Aktive Auktion #{activeAuction.auction_index + 1}</PanelTitle>
                <PanelDescription>
                  Mindestpreis {formatMoney(displayMinimumBid)}
                  {highestBidClub ? ` - Hoechstgebot ${formatMoney(activeAuction.current_amount)} von ${highestBidClub.club_name}` : ""}
                </PanelDescription>
              </div>
              <Badge tone="green">aktiv</Badge>
            </PanelHeader>
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="max-w-[220px]">
                <PlayerCard player={mapCatalogPlayerToCardData(activeAuction.player)} showArchetypes={snapshot.game.settings.archetypes_enabled !== false} variant="draft" />
              </div>
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <SmallInfo label="Spieler" value={activeAuction.player.display_name} />
                  <SmallInfo label="Position" value={getPlayerPositionLabel(activeAuction.player)} />
                  <SmallInfo label="Mindestpreis" value={formatMoney(displayMinimumBid)} />
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
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="list">
      <PanelHeader>
        <div>
          <PanelTitle>Auktionsliste</PanelTitle>
          <PanelDescription>Spieler werden erst beim Aufrufen der Auktion enthüllt.</PanelDescription>
        </div>
        <ClipboardList size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {deadline.auctions.map((auction) => {
          const hidden = auction.status === "scheduled" && auction.player.visibility === "hidden";
          return (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={auction.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {hidden ? (
                    <>
                      <p className="text-sm font-semibold text-zinc-500">#{auction.auction_index + 1} — noch verdeckt</p>
                      <p className="mt-1 text-xs text-zinc-700">Spieler wird beim Start der Auktion enthüllt</p>
                    </>
                  ) : (
                    <>
                      <p className="truncate text-sm font-semibold text-zinc-50">#{auction.auction_index + 1} {auction.player.display_name}</p>
                      <p className="mt-1 text-xs text-zinc-500">Min. {formatMoney(getCatalogMinimumBidFromPlayer(auction.player))}</p>
                    </>
                  )}
                </div>
                <Badge tone={getAuctionBadgeTone(auction.status)}>{getAuctionStatusLabel(auction.status)}</Badge>
              </div>
              {!hidden ? (
                <>
                  <div className="mt-3 max-w-[180px]">
                    <PlayerCard player={mapCatalogPlayerToCardData(auction.player)} showArchetypes={snapshot.game.settings.archetypes_enabled !== false} variant="draft" />
                  </div>
                  <p className="mt-3 text-xs text-zinc-400">
                    {auction.winning_club_id
                      ? `${clubNames.get(auction.winning_club_id) ?? "Club"} — ${formatMoney(auction.current_amount)}`
                      : "Noch kein Zuschlag"}
                  </p>
                </>
              ) : null}
            </div>
          );
        })}
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

  const lineupCards = getSortedSquadPlayers(overview.squad).map((owned) => {
    const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
    return {
      ...mapOwnedPlayerToLineupCardData(owned),
      unavailable: isPlayerUnavailableForSeason(seasonNumber, owned.unavailable_until_season),
    };
  });
  const hasGoalkeeper = lineupCards.some((card) => card.positions.includes("GK"));
  const staffEffects = (overview.staff ?? []).flatMap(
    (s) => s.card.effects as Array<{ type: string; zone?: string; stars?: number }>,
  );
  const currentFixture = snapshot.season?.fixtures.find(
    (fixture) =>
      fixture.matchday === snapshot.season?.current_matchday &&
      fixture.status !== "completed" &&
      (fixture.home_participant.club_id === ownClub.id || fixture.away_participant.club_id === ownClub.id),
  );
  const opponentClubId =
    currentFixture?.home_participant.club_id === ownClub.id
      ? currentFixture.away_participant.club_id
      : currentFixture?.away_participant.club_id;
  const opponentName = !currentFixture
    ? ""
    : currentFixture.home_participant.club_id === ownClub.id
      ? currentFixture.away_participant.display_name
      : currentFixture.home_participant.display_name;
  const liveOpponentLineup =
    snapshot.season?.opponent_locked_lineups?.find((entry) => entry.fixture_id === currentFixture?.id)?.lineup ?? null;

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="lineup" />
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

      <CaptainPanel
        boostExtra={getCaptainBoostExtra(staffEffects)}
        gameId={snapshot.game.id}
        roomCode={snapshot.game.room_code}
        squad={overview.squad}
        captainClubPlayerId={ownClub.captain_club_player_id}
        boostRank={ownClub.captain_boost_rank}
      />

      {currentFixture ? (
        <OpponentIntelPanel
          analyticsLevel={ownClub.analytics_hub_level ?? 0}
          fixtures={snapshot.season?.fixtures ?? []}
          liveLineup={liveOpponentLineup}
          opponentClubId={opponentClubId}
          opponentName={opponentName}
        />
      ) : null}

      <div id="board">
        <GameLineupBoard
          archetypesEnabled={snapshot.game.settings.archetypes_enabled !== false}
          cards={lineupCards}
          gameId={snapshot.game.id}
          roomCode={snapshot.game.room_code}
          staffEffects={staffEffects}
          captainId={ownClub.captain_club_player_id ?? null}
          captainBoost={Math.trunc(Number(ownClub.captain_boost_rank ?? 0)) + getCaptainBoostExtra(staffEffects)}
        />
      </div>
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

  const groundsHiddenSections = [
    ...(snapshot.game.settings.sponsoring_enabled === false ? ["sponsoring"] : []),
    ...(!overview.open_staff_offer ? ["staff"] : []),
  ];

  return (
    <div className="space-y-4">
      <ViewGuidePanel
        hiddenSectionIds={focus === "grounds" ? groundsHiddenSections : undefined}
        roomCode={snapshot.game.room_code}
        view={focus === "squad" ? "squad" : "grounds"}
      />
      {focus === "grounds" ? <ClubFinancePanel ownClub={ownClub} overview={overview} snapshot={snapshot} /> : null}
      {focus === "grounds" ? <FacilityUpgradePanel ownClub={ownClub} overview={overview} snapshot={snapshot} /> : null}
      {focus === "grounds" ? (
        snapshot.game.settings.sponsoring_enabled === false ? (
          <Panel className="border-zinc-800 bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Sponsoring</PanelTitle>
                <PanelDescription>Sponsoring ist in den Lobby-Einstellungen fuer diesen Spielstand ausgeschaltet.</PanelDescription>
              </div>
              <Banknote size={18} className="text-zinc-500" aria-hidden />
            </PanelHeader>
          </Panel>
        ) : (
          <SponsorPanel ownClub={ownClub} overview={overview} snapshot={snapshot} />
        )
      ) : null}
      {focus === "grounds" && overview.open_staff_offer ? (
        <StaffMarketView offer={overview.open_staff_offer} ownClub={ownClub} snapshot={snapshot} />
      ) : null}
      {focus === "squad" ? <SquadHubPanel ownClub={ownClub} overview={overview} snapshot={snapshot} /> : null}
      {focus === "grounds" ? <ClubCardsPanel ownClub={ownClub} overview={overview} snapshot={snapshot} /> : null}
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
  const season = snapshot.season;
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
  const effectiveStatus = resolveEffectiveClubStatus(ownClub, seasonNumber);
  const statusOverrideActive = finance.status_override_active ?? isClubStatusOverrideActive(ownClub, seasonNumber);

  const managerStanding = season?.manager_standings.find((s) => s.club_id === ownClub.id);
  const hasActiveSeason = Boolean(season && !season.setup_error);
  const managerRank = managerStanding?.rank ?? ownClub.season_rank ?? 1;
  const placementReward = finance.placement_reward;
  const stadiumIncome = finance.stadium_income;
  const totalIncome = finance.projected_income;
  const wages = finance.wages;
  const net = finance.projected_net;

  const rankLabel = hasActiveSeason
    ? `Manager-Rang #${managerRank} · Spieltag ${season?.current_matchday ?? "–"}`
    : `Manager-Rang #${managerRank} · letztes Saisonende`;

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="finance">
      <PanelHeader>
        <div>
          <PanelTitle>{ownClub.club_name}</PanelTitle>
          <PanelDescription>Finanzen und voraussichtliche Saisonabrechnung.</PanelDescription>
        </div>
        <Banknote size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Metric detail="aktueller Kontostand" icon={Banknote} label="Geld" value={formatMoney(finance.money)} />
        <Metric detail={`${formatStars(finance.squad_stars)} Kadersterne · 1M pro Stern`} icon={Users} label="Gehaelter" value={formatMoney(wages)} />
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/70 overflow-hidden">
        <div className="border-b border-zinc-800 px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Einnahmen</p>
        </div>
        <div className="divide-y divide-zinc-800/60">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-sm text-zinc-200">Stadioneinnahmen</p>
              <p className="text-xs text-zinc-500">
                Stadion L{ownClub.stadium_level ?? 1} · Status: {getClubStatusLabel(effectiveStatus)}
                {statusOverrideActive ? " · Game Changer aktiv" : ""}
              </p>
            </div>
            <p className="text-sm font-semibold text-emerald-300">+{formatMoney(stadiumIncome)}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-sm text-zinc-200">Platzierungspraemie</p>
              <p className="text-xs text-zinc-500">{rankLabel}</p>
            </div>
            <p className="text-sm font-semibold text-emerald-300">+{formatMoney(placementReward)}</p>
          </div>
          <div className="flex items-center justify-between bg-zinc-800/30 px-4 py-2.5">
            <p className="text-sm font-semibold text-zinc-300">Einnahmen gesamt</p>
            <p className="text-sm font-bold text-emerald-200">+{formatMoney(totalIncome)}</p>
          </div>
        </div>

        <div className="border-b border-t border-zinc-800 px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Ausgaben</p>
        </div>
        <div className="divide-y divide-zinc-800/60">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-sm text-zinc-200">Gehaelter</p>
              <p className="text-xs text-zinc-500">{formatStars(finance.squad_stars)} Sterne × 1M</p>
            </div>
            <p className="text-sm font-semibold text-rose-300">−{formatMoney(wages)}</p>
          </div>
        </div>

        <div className="border-t border-zinc-800 bg-zinc-800/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-200">Netto bei Saisonabschluss</p>
              <p className="text-xs text-zinc-500">Abrechnung erfolgt am Saisonende. Rang und Status zum Zeitpunkt der Abrechnung massgeblich.</p>
            </div>
            <p className={cn("ml-4 shrink-0 text-xl font-black", net >= 0 ? "text-emerald-200" : "text-rose-200")}>
              {net >= 0 ? "+" : ""}{formatMoney(net)}
            </p>
          </div>
        </div>
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

  const managerStanding = snapshot.season?.manager_standings.find((s) => s.club_id === ownClub.id);
  const seasonNumber = Number(snapshot.game.settings?.seasonNumber ?? 1);
  const clubStatus = resolveEffectiveClubStatus(ownClub, seasonNumber);
  const statusOverrideActive = isClubStatusOverrideActive(ownClub, seasonNumber);

  const extraInvestmentSlots = overview.staff.reduce((sum, s) => {
    return sum + (s.card.effects as Array<{ type: string; extra?: number }>)
      .filter((e) => e.type === "investment_action_bonus")
      .reduce((a, e) => a + (e.extra ?? 0), 0);
  }, 0);
  const actionLimit = getInvestmentActionLimit(extraInvestmentSlots, ownClub.construction_yard_built ?? false);
  const investmentClubStatus = resolveClubInvestmentStatus(
    ownClub,
    seasonNumber,
    managerStanding?.stage_score,
  );

  const LEVELS = [1, 2, 3, 4] as const;
  const ALL_STATUSES = ["newly_promoted", "established", "mid_table", "title_contender"] as const;
  const [stadiumViewStatus, setStadiumViewStatus] = useState<typeof ALL_STATUSES[number]>(clubStatus);

  function renderTrainingEffects(level: number) {
    const cur = getTrainingCapacity(level);
    const next = level < 4 ? getTrainingCapacity(level + 1) : null;
    return (
      <div className="mt-3 space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs">
        <div>
          <p className="font-semibold text-zinc-400">Aktuell (L{level})</p>
          <p className="mt-1 text-zinc-300">
            {cur.players} Spieler/Phase · max +{cur.maxStarsPerPlayer} Stern(e)/Spieler
            {cur.guaranteedStarForPlayers > 0 ? " · +1 Stern garantiert" : ""}
          </p>
        </div>
        {next ? (
          <div className="border-t border-zinc-800 pt-2">
            <p className="font-semibold text-[var(--club-color)]">Stufe {level + 1}</p>
            <p className="mt-1 text-zinc-400">
              {next.players} Spieler/Phase · max +{next.maxStarsPerPlayer} Stern(e)/Spieler
              {next.guaranteedStarForPlayers > 0 ? " · +1 Stern garantiert" : ""}
            </p>
          </div>
        ) : (
          <div className="border-t border-zinc-800 pt-2">
            <p className="text-zinc-600">Maximalstufe erreicht.</p>
          </div>
        )}
      </div>
    );
  }

  function renderScoutingEffects(level: number) {
    const cur = getScoutingCapacity(level);
    const next = level < 4 ? getScoutingCapacity(level + 1) : null;
    return (
      <div className="mt-3 space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs">
        <div>
          <p className="font-semibold text-zinc-400">Aktuell (L{level})</p>
          <p className="mt-1 text-zinc-300">{cur.players} Karte(n) pro Scouting-Phase</p>
        </div>
        {next ? (
          <div className="border-t border-zinc-800 pt-2">
            <p className="font-semibold text-[var(--club-color)]">Stufe {level + 1}</p>
            <p className="mt-1 text-zinc-400">{next.players} Karte(n) pro Scouting-Phase</p>
          </div>
        ) : (
          <div className="border-t border-zinc-800 pt-2">
            <p className="text-zinc-600">Maximalstufe erreicht.</p>
          </div>
        )}
      </div>
    );
  }

  function renderStadiumEffects(currentLevel: number) {
    return (
      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs">
        {statusOverrideActive ? (
          <p className="mb-2 text-[11px] text-emerald-300">
            Game-Changer-Status aktiv: {getClubStatusLabel(clubStatus)} (Stadioneinnahmen bis Saisonende)
          </p>
        ) : null}
        <div className="mb-2 flex flex-wrap gap-1">
          {ALL_STATUSES.map((st) => {
            const isOwn = st === clubStatus;
            const isSelected = st === stadiumViewStatus;
            return (
              <button
                key={st}
                onClick={() => setStadiumViewStatus(st)}
                type="button"
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                  isSelected
                    ? "bg-[var(--club-color)] text-zinc-950"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
                  isOwn && !isSelected && "ring-1 ring-[var(--club-color)]/50",
                )}
              >
                {getClubStatusLabel(st)}{isOwn ? " ★" : ""}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {LEVELS.map((lvl) => {
            const income = getStadiumIncome(lvl, stadiumViewStatus);
            const isCurrent = lvl === currentLevel;
            return (
              <div
                key={lvl}
                className={cn(
                  "rounded border px-1.5 py-1.5 text-center",
                  isCurrent
                    ? "border-[var(--club-color)] bg-[var(--club-color)]/15"
                    : lvl < currentLevel
                      ? "border-zinc-800 bg-zinc-900/30 opacity-40"
                      : "border-zinc-700 bg-zinc-900/50",
                )}
              >
                <p className={cn("font-semibold", isCurrent ? "text-[var(--club-color)]" : lvl > currentLevel ? "text-zinc-300" : "text-zinc-600")}>L{lvl}</p>
                <p className={cn("mt-0.5", isCurrent ? "text-[var(--club-color)]" : lvl > currentLevel ? "text-zinc-400" : "text-zinc-700")}>{formatMoney(income)}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const facilities: Array<{
    action: UpgradeAction;
    icon: typeof Home;
    label: string;
    level: number;
    renderEffects: (level: number) => ReactNode;
  }> = [
    { action: "training", icon: Dumbbell, label: "Training", level: ownClub.training_level ?? 1, renderEffects: renderTrainingEffects },
    { action: "scouting", icon: Eye, label: "Scouting", level: ownClub.scouting_level ?? 1, renderEffects: renderScoutingEffects },
    { action: "stadium", icon: Building2, label: "Stadion", level: ownClub.stadium_level ?? 1, renderEffects: renderStadiumEffects },
  ];

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="facilities">
      <PanelHeader>
        <div>
          <PanelTitle>Vereinsgelaende</PanelTitle>
          <PanelDescription>
            {overview.investments.length}/{actionLimit} Investment-Aktionen in Saison {overview.season_number} verwendet.
            {ownClub.construction_yard_built ? " · Bauhof: +2 Slots" : ""}
          </PanelDescription>
        </div>
        <Building2 size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {facilities.map((facility) => {
          const check = canUpgradeFacility({
            action: facility.action,
            actionsThisSeason,
            currentLevel: facility.level,
            money: overview.finance.money,
            extraActionBonus: extraInvestmentSlots,
            actionLimit,
          });
          const stadiumBlocked = facility.action === "stadium" && overview.stadium_upgrade_blocked_by_sponsor;
          const upgradeDisabled = !investmentPhaseActive || !check.ok || stadiumBlocked;
          const cost = getUpgradeCost(facility.action, facility.level);
          const Icon = facility.icon;
          const disabledTitle = stadiumBlocked
            ? "Denkmalschutz-Sponsoring: Stadionausbau gesperrt"
            : !investmentPhaseActive
              ? "Nur in der Investmentphase"
              : check.ok
                ? "Upgrade kaufen"
                : getUpgradeReasonLabel(check.reason);

          return (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4" key={facility.action}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-50">{facility.label}</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--club-color)]">Level {facility.level}/4</p>
                </div>
                <Icon size={18} className="text-[var(--club-color)]" aria-hidden />
              </div>

              {facility.renderEffects(facility.level)}

              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>Naechstes Upgrade</span>
                <span className="font-semibold text-zinc-300">{facility.level >= 4 ? "Max erreicht" : formatMoney(cost)}</span>
              </div>
              <form action={upgradeInvestmentAction} className="mt-2">
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="club_id" type="hidden" value={ownClub.id} />
                <input name="action" type="hidden" value={facility.action} />
                <Button
                  className="w-full"
                  disabled={upgradeDisabled}
                  title={disabledTitle}
                  type="submit"
                >
                  {stadiumBlocked
                    ? "Stadionausbau gesperrt"
                    : !investmentPhaseActive
                      ? "Investmentphase abwarten"
                      : check.ok
                        ? "Upgrade kaufen"
                        : getUpgradeReasonLabel(check.reason)}
                </Button>
              </form>
            </div>
          );
        })}

        {(
          [
            { action: "medical" as EndgameFacilityAction, icon: HeartPulse, effects: ["1 manuelle Heilung/Saison", "2 manuelle Heilungen/Saison", "Alle Verletzungen sofort geheilt"] },
            { action: "analytics" as EndgameFacilityAction, icon: LineChart, effects: ["Letzte Gegner-Aufstellung", "Live-Spionage bei Lock", "Deadline-Day Insider"] },
            { action: "youth_academy" as EndgameFacilityAction, icon: GraduationCap, effects: ["1 NLZ-Talent/Off-Season", "Archetyp-Umschmiede 1x/Saison", "2 Talente + Trainingsgarantie"] },
            { action: "construction_yard" as EndgameFacilityAction, icon: Hammer, effects: ["+2 Investment-Aktionen dauerhaft"] },
          ] as const
        ).map((facility) => {
          const level = getEndgameFacilityLevel(ownClub, facility.action);
          const maxLevel = facility.action === "construction_yard" ? 1 : 3;
          const targetLevel = facility.action === "construction_yard" ? 1 : Math.min(maxLevel, level + 1);
          const requirement = getEndgameUnlockRequirement(facility.action, targetLevel);
          const unlockMet = isEndgameUnlockMet(investmentClubStatus, requirement);
          const check = canUpgradeEndgameFacility({
            action: facility.action,
            actionsThisSeason,
            clubStatus: investmentClubStatus,
            currentLevel: level,
            money: overview.finance.money,
            actionLimit,
          });
          const upgradeDisabled = !investmentPhaseActive || !check.ok;
          const cost = getEndgameUpgradeCost(facility.action, level);
          const Icon = facility.icon;
          const lockLabel =
            requirement === "title_contender" ? "Benötigt: Titelanwärter" : "Benötigt: Mittlerer Tabellenplatz";

          return (
            <div className="rounded-md border border-violet-900/50 bg-violet-950/20 p-4 lg:col-span-1" key={facility.action}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-50">{ENDGAME_FACILITY_LABELS[facility.action]}</p>
                  <p className="mt-0.5 text-xs font-bold text-violet-300">
                    {facility.action === "construction_yard"
                      ? level >= 1
                        ? "Gebaut"
                        : "Nicht gebaut"
                      : `Stufe ${level}/${maxLevel}`}
                  </p>
                </div>
                <Icon size={18} className="text-violet-300" aria-hidden />
              </div>
              {!unlockMet && level < maxLevel ? (
                <p className="mt-2 rounded border border-amber-900/60 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">{lockLabel}</p>
              ) : null}
              <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-300">
                {facility.action === "construction_yard" ? (
                  <p>Einmaliger Kauf — dauerhaft +2 Bauprojekte pro Off-Season.</p>
                ) : (
                  <ul className="space-y-1">
                    {facility.effects.map((effect, index) => (
                      <li className={cn(index + 1 === level ? "font-semibold text-violet-200" : index + 1 < level ? "text-zinc-600 line-through" : "")} key={effect}>
                        Stufe {index + 1}: {effect}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>{facility.action === "construction_yard" && level >= 1 ? "Status" : "Naechstes Upgrade"}</span>
                <span className="font-semibold text-zinc-300">
                  {level >= maxLevel ? "Max erreicht" : formatMoney(cost)}
                </span>
              </div>
              <form action={upgradeInvestmentAction} className="mt-2">
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="club_id" type="hidden" value={ownClub.id} />
                <input name="action" type="hidden" value={facility.action} />
                <Button
                  className="w-full"
                  disabled={upgradeDisabled}
                  title={
                    !investmentPhaseActive
                      ? "Nur in der Investmentphase"
                      : check.ok
                        ? "Upgrade kaufen"
                        : getEndgameUpgradeReasonLabel(check.reason)
                  }
                  type="submit"
                >
                  {!investmentPhaseActive
                    ? "Investmentphase abwarten"
                    : check.ok
                      ? facility.action === "construction_yard" && level >= 1
                        ? "Bereits gebaut"
                        : "Upgrade kaufen"
                      : getEndgameUpgradeReasonLabel(check.reason)}
                </Button>
              </form>
            </div>
          );
        })}

        {/* Mitarbeiter-Karte */}
        {(() => {
          const hasFreeStaffOffer = overview.pending_effects.some(
            (effect) =>
              effect.effect_type === "free_staff_offer" &&
              isOffseasonPendingScopeActive(effect.scope, snapshot.game.phase),
          );
          const hasFreeStaffSigning = overview.pending_effects.some(
            (effect) =>
              effect.effect_type === "free_staff_signing" &&
              isOffseasonPendingScopeActive(effect.scope, snapshot.game.phase),
          );
          const staffRecruitInput = {
            actionsThisSeason,
            currentStaffCount: overview.staff.length,
            hasOpenOffer: Boolean(overview.open_staff_offer),
            extraActionBonus: extraInvestmentSlots,
            actionLimit,
            hasFreeStaffOffer,
          };
          const staffBlockReason = getStaffRecruitBlockReason(staffRecruitInput);
          const staffCheckOk = staffBlockReason === null;
          const staffHint = getStaffRecruitHint({
            hasFreeStaffOffer,
            hasFreeStaffSigning,
            actionsThisSeason,
            extraActionBonus: extraInvestmentSlots,
            actionLimit,
          });
          const staffDisabled = !investmentPhaseActive || !staffCheckOk;
          return (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-50">Mitarbeiter</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--club-color)]">{overview.staff.length}/3 angeheuert</p>
                </div>
                <UserCheck size={18} className="text-[var(--club-color)]" aria-hidden />
              </div>
              <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs">
                <p className="font-semibold text-zinc-400">Wie es funktioniert</p>
                <p className="mt-1 text-zinc-300">2 zufaellige Mitarbeiterkarten werden gezogen. Einen kannst du rekrutieren oder beide ablehnen.</p>
                <p className="mt-1.5 text-zinc-500">Max. 3 Mitarbeiter. Entlassen jederzeit moeglich.</p>
                {hasFreeStaffOffer ? (
                  <p className="mt-2 text-amber-200">
                    Manager of the Year: Zuerst Mitarbeiter ziehen, solange noch Investment-Aktionen frei sind – danach geht der Gratis-Zug nicht mehr.
                  </p>
                ) : null}
                {staffHint && !hasFreeStaffOffer ? <p className="mt-2 text-emerald-300">{staffHint}</p> : null}
              </div>
              <form action={recruitStaffOpenAction} className="mt-4">
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="club_id" type="hidden" value={ownClub.id} />
                <Button
                  className="w-full"
                  disabled={staffDisabled}
                  title={
                    !investmentPhaseActive
                      ? "Nur in der Investmentphase"
                      : staffCheckOk
                        ? hasFreeStaffOffer
                          ? "Gratis Staff-Draw (Game Changer)"
                          : "Mitarbeitermarkt oeffnen"
                        : getStaffRecruitReasonLabel(staffBlockReason ?? "investment_action_limit")
                  }
                  type="submit"
                >
                  {!investmentPhaseActive
                    ? "Investmentphase abwarten"
                    : staffCheckOk
                      ? hasFreeStaffOffer
                        ? "Gratis Mitarbeiter ziehen"
                        : "Mitarbeiter rekrutieren"
                      : getStaffRecruitReasonLabel(staffBlockReason ?? "investment_action_limit")}
                </Button>
              </form>
            </div>
          );
        })()}
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

function SquadHubPanel({
  overview,
  ownClub,
  snapshot,
}: {
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  ownClub: LobbyClub;
  snapshot: LobbySnapshot;
}) {
  const searchParams = useSearchParams();
  const fallbackOwnSquad = {
    club: {
      club_color: ownClub.club_color,
      club_name: ownClub.club_name,
      id: ownClub.id,
      image_url: ownClub.image_url,
      manager_name: ownClub.manager_name,
      squad_stars: ownClub.squad_stars,
    },
    injured_count: overview.squad.filter((player) => player.injured).length,
    player_count: overview.squad.length,
    squad: overview.squad,
    squad_stars: overview.finance.squad_stars,
  };
  const clubSquads = snapshot.club_squads?.length ? snapshot.club_squads : [fallbackOwnSquad];
  const requestedClubId = searchParams.get("club");
  const selectedClubId = clubSquads.some((item) => item.club.id === requestedClubId) ? requestedClubId : ownClub.id;
  const selectedSquad = clubSquads.find((item) => item.club.id === selectedClubId) ?? clubSquads[0] ?? fallbackOwnSquad;
  const ownSelected = selectedSquad.club.id === ownClub.id;
  const archetypesEnabled = snapshot.game.settings.archetypes_enabled !== false;

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="hub">
        <PanelHeader>
          <div>
            <PanelTitle>Kaderuebersicht</PanelTitle>
            <PanelDescription>Eigene und fremde Manager-Kader im direkten Vergleich.</PanelDescription>
          </div>
          <Users size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {clubSquads.map((clubSquad) => {
              const active = clubSquad.club.id === selectedSquad.club.id;

              return (
                <Link
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition",
                    active
                      ? "border-[var(--club-color)] bg-[rgba(var(--club-rgb),0.22)] text-zinc-50"
                      : "border-zinc-800 bg-zinc-950/65 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100",
                  )}
                  href={`/games/${snapshot.game.room_code}?view=squad&club=${clubSquad.club.id}`}
                  key={clubSquad.club.id}
                >
                  <span className="max-w-[12rem] truncate">{clubSquad.club.club_name}</span>
                  <Badge tone={clubSquad.club.id === ownClub.id ? "green" : "blue"}>{clubSquad.player_count}</Badge>
                </Link>
              );
            })}
          </div>
        </div>
      </Panel>

      {archetypesEnabled ? (
        <div id="archetypes">
          <ArchetypeMatchupGuide />
        </div>
      ) : null}

      {ownSelected ? (
        <SquadPanel archetypesEnabled={archetypesEnabled} ownClub={ownClub} overview={overview} snapshot={snapshot} title={ownClub.club_name} />
      ) : (
        <OtherClubSquadPanel archetypesEnabled={archetypesEnabled} overview={overview} selectedSquad={selectedSquad} snapshot={snapshot} />
      )}
    </div>
  );
}

function OtherClubSquadPanel({
  archetypesEnabled,
  overview,
  selectedSquad,
  snapshot,
}: {
  archetypesEnabled: boolean;
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  selectedSquad: NonNullable<LobbySnapshot["club_squads"]>[number];
  snapshot: LobbySnapshot;
}) {
  const [offerTarget, setOfferTarget] = useState<ClubPlayerSnapshot | null>(null);
  const sortedSquad = [...selectedSquad.squad].sort((a, b) => {
    const posDiff = getPositionRank(a.player) - getPositionRank(b.player);
    if (posDiff !== 0) return posDiff;
    const starsDiff = Number(b.current_stars) - Number(a.current_stars);
    if (starsDiff !== 0) return starsDiff;
    return getClubPlayerDisplayName(a).localeCompare(getClubPlayerDisplayName(b), "de");
  });
  const isOffseason = isOffseasonPhase(snapshot.game.phase);
  const transfersBlocked = isOffseasonTransfersBlocked(overview.pending_effects ?? [], snapshot.game.phase);
  const managerTransfersEnabled = isOffseason && !transfersBlocked && !snapshot.transfer_market?.setup_error;
  const offeredPlayerIds = new Set((snapshot.transfer_market?.outgoing_offers ?? []).flatMap((offer) => offer.offered_club_player_id ? [offer.offered_club_player_id] : []));
  const targetedPlayerIds = new Set((snapshot.transfer_market?.outgoing_offers ?? []).map((offer) => offer.target_club_player_id));
  const ownOfferPlayers = overview.squad.filter((owned) => !offeredPlayerIds.has(owned.id));
  const transferHint = snapshot.transfer_market?.setup_error
    ? snapshot.transfer_market.setup_error
    : transfersBlocked
      ? "Manager-Transfers sind durch einen Game-Changer gesperrt."
      : isOffseason
        ? "Manager-Angebote sind in dieser Phase moeglich."
        : "Angebote sind erst in der Offseason moeglich.";

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="roster">
      <PanelHeader>
        <div>
          <PanelTitle>{selectedSquad.club.club_name}</PanelTitle>
          <PanelDescription>{selectedSquad.club.manager_name} - {selectedSquad.player_count} von maximal {MAX_SQUAD_SIZE} Spielern im Kader.</PanelDescription>
        </div>
        <Eye size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric detail={`max. ${MAX_SQUAD_SIZE} Spieler`} icon={Users} label="Kadergroesse" value={`${selectedSquad.player_count} / ${MAX_SQUAD_SIZE}`} />
        <Metric detail={`${selectedSquad.injured_count} verletzt`} icon={Sparkles} label="Kadersterne gesamt" value={formatStars(selectedSquad.squad_stars)} />
        <Metric detail="Durchschnitt pro Spieler" icon={Sparkles} label="Sterne/Spieler" value={selectedSquad.player_count > 0 ? formatStars(selectedSquad.squad_stars / selectedSquad.player_count) : "-"} />
      </div>
      {selectedSquad.squad.length > 0 ? <SquadPositionBreakdown className="mt-3" squad={selectedSquad.squad} /> : null}
      {archetypesEnabled ? (
        <SquadArchetypeOverview
          className="mt-3"
          clubName={selectedSquad.club.club_name}
          showMatchupGuide={false}
          squad={selectedSquad.squad}
        />
      ) : null}
      <div className={cn("rounded-md border p-3 text-xs", managerTransfersEnabled ? "border-emerald-800 bg-emerald-950/20 text-emerald-300" : "border-zinc-800 bg-zinc-900/60 text-zinc-400")}>
        {transferHint}
      </div>
      {selectedSquad.squad.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
          Dieser Club hat aktuell keinen Kader.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sortedSquad.map((owned) => {
            const card = mapOwnedPlayerToCardData(owned);
            const hasOpenOffer = targetedPlayerIds.has(owned.id);

            return (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/45 p-2" key={owned.id}>
                <PlayerCard disabled={owned.injured} player={card} showArchetypes={snapshot?.game.settings.archetypes_enabled !== false} variant="draft" />
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <SmallInfo label="Status" value={owned.injured ? "Verletzt" : owned.current_zone === "bench" ? "Nicht aufgestellt" : "Aufgestellt"} />
                  <SmallInfo label="Zone" value={owned.current_zone} />
                  <SmallInfo label="Staerke" value={formatStars(Number(owned.current_stars))} />
                  <SmallInfo label="Marktwert" value={formatMoney(getCardTransferMoney(card.market))} />
                </div>
                <Button
                  className="mt-2 h-8 w-full text-xs"
                  disabled={!managerTransfersEnabled || hasOpenOffer}
                  onClick={() => setOfferTarget(owned)}
                  type="button"
                  variant={managerTransfersEnabled && !hasOpenOffer ? "primary" : "outline"}
                >
                  <ArrowUpRight size={13} aria-hidden />
                  {hasOpenOffer ? "Angebot offen" : "Angebot machen"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {offerTarget ? (
        <TransferOfferModal
          enabled={managerTransfersEnabled}
          offerPlayers={ownOfferPlayers}
          onClose={() => setOfferTarget(null)}
          returnClubId={selectedSquad.club.id}
          snapshot={snapshot}
          target={offerTarget}
        />
      ) : null}
    </Panel>
  );
}

function TransferOfferModal({
  enabled,
  offerPlayers,
  onClose,
  returnClubId,
  snapshot,
  target,
}: {
  enabled: boolean;
  offerPlayers: ClubPlayerSnapshot[];
  onClose: () => void;
  returnClubId: string;
  snapshot: LobbySnapshot;
  target: ClubPlayerSnapshot;
}) {
  const [offeredPlayerId, setOfferedPlayerId] = useState("none");
  const archetypesEnabled = snapshot.game.settings.archetypes_enabled !== false;
  const defaultCashMillions = getOwnedCardTransferMillions(mapOwnedPlayerToCardData(target));
  const selectedOfferPlayer =
    offeredPlayerId === "none" ? null : (offerPlayers.find((ownPlayer) => ownPlayer.id === offeredPlayerId) ?? null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-zinc-50">Angebot machen</p>
            <p className="mt-1 text-sm text-zinc-400">Waehle Geld und optional einen eigenen Spieler fuer den Tausch.</p>
          </div>
          <Button className="h-8 px-2" onClick={onClose} type="button" variant="outline">
            <X size={15} aria-hidden />
          </Button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Angefragt</p>
            <PlayerCard
              disabled={target.injured}
              player={mapOwnedPlayerToCardData(target)}
              showArchetypes={archetypesEnabled}
              variant="draft"
            />
            <p className="mt-2 text-xs text-zinc-400">{formatTransferPlayerMeta(target)}</p>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 px-1 pt-8 text-zinc-500">
            <ArrowLeftRight size={18} aria-hidden />
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dein Spieler</p>
            {selectedOfferPlayer ? (
              <>
                <PlayerCard
                  disabled={selectedOfferPlayer.injured}
                  player={mapOwnedPlayerToCardData(selectedOfferPlayer)}
                  showArchetypes={archetypesEnabled}
                  variant="draft"
                />
                <p className="mt-2 text-xs text-zinc-400">{formatTransferPlayerMeta(selectedOfferPlayer)}</p>
              </>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950/60 px-4 text-center text-xs text-zinc-500">
                Optional unten einen eigenen Spieler auswaehlen
              </div>
            )}
          </div>
        </div>

        <form action={createTransferOfferAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <input name="target_club_player_id" type="hidden" value={target.id} />
          <input name="return_view" type="hidden" value="squad" />
          <input name="return_club_id" type="hidden" value={returnClubId} />
          <label className="grid gap-1 text-xs text-zinc-400">
            Geldangebot in Mio
            <input
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300"
              min={0}
              name="cash_amount_millions"
              step={1}
              type="number"
              defaultValue={defaultCashMillions}
            />
          </label>
          <label className="grid gap-1 text-xs text-zinc-400">
            Eigener Spieler optional
            <select
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300"
              name="offered_club_player_id"
              onChange={(event) => setOfferedPlayerId(event.target.value)}
              value={offeredPlayerId}
            >
              <option value="none">Kein Spieler</option>
              {offerPlayers.map((ownPlayer) => (
                <option key={ownPlayer.id} value={ownPlayer.id}>
                  {getClubPlayerDisplayName(ownPlayer)} ({formatTransferPlayerMeta(ownPlayer)})
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2">
            <Button onClick={onClose} type="button" variant="outline">
              Abbrechen
            </Button>
            <Button disabled={!enabled} type="submit" variant="primary">
              <ArrowUpRight size={14} aria-hidden />
              Angebot senden
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SquadPanel({
  archetypesEnabled,
  overview,
  ownClub,
  snapshot,
  title,
}: {
  archetypesEnabled: boolean;
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  ownClub?: LobbyClub;
  snapshot?: LobbySnapshot;
  title: string;
}) {
  const [renameTarget, setRenameTarget] = useState<ClubPlayerSnapshot | null>(null);
  const totalStars = overview.finance.squad_stars;
  const sortedSquad = [...overview.squad].sort((a, b) => {
    const posDiff = getPositionRank(a.player) - getPositionRank(b.player);
    if (posDiff !== 0) return posDiff;
    const starsDiff = Number(b.current_stars) - Number(a.current_stars);
    if (starsDiff !== 0) return starsDiff;
    return getClubPlayerDisplayName(a).localeCompare(getClubPlayerDisplayName(b), "de");
  });
  const playerCount = overview.squad.length;

  const miraHealCharges = overview.staff.reduce((sum, s) => {
    return sum + (s.card.effects as Array<{ type: string; perMatchday?: number }>)
      .filter((e) => e.type === "injury_heal_manual")
      .reduce((a, e) => a + (e.perMatchday ?? 0), 0);
  }, 0);
  const medicalHealsRemaining = overview.medical_heals_remaining ?? 0;
  const hasMedicalHeals =
    Number.isFinite(medicalHealsRemaining) && medicalHealsRemaining > 0;
  const nlzRespecAvailable = overview.nlz_archetype_respec_available ?? false;

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="roster">
      <PanelHeader>
        <div>
          <PanelTitle>{title}</PanelTitle>
          <PanelDescription>{playerCount} von maximal {MAX_SQUAD_SIZE} Spielern im Kader.</PanelDescription>
        </div>
        <Users size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          detail={`max. ${MAX_SQUAD_SIZE} Spieler`}
          icon={Users}
          label="Kadergrösse"
          value={`${playerCount} / ${MAX_SQUAD_SIZE}`}
        />
        <Metric
          detail={`${MAX_SQUAD_SIZE - playerCount} Plätze frei`}
          icon={Sparkles}
          label="Kadersterne gesamt"
          value={formatStars(totalStars)}
        />
        <Metric
          detail="Durchschnitt pro Spieler"
          icon={Sparkles}
          label="Ø Sterne"
          value={playerCount > 0 ? formatStars(totalStars / playerCount) : "–"}
        />
      </div>
      {overview.squad.length > 0 ? <SquadPositionBreakdown className="mt-3" squad={overview.squad} /> : null}
      {archetypesEnabled ? (
        <SquadArchetypeOverview className="mt-3" clubName={title} showMatchupGuide={false} squad={overview.squad} />
      ) : null}
      {miraHealCharges > 0 && (
        <div className="rounded-md border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300">
          <p className="font-semibold">Mira Cleure aktiv — {miraHealCharges} Heilung(en) verfuegbar</p>
          <p className="mt-0.5 text-amber-400">Klicke auf &quot;Heilen&quot; bei einem verletzten Spieler.</p>
        </div>
      )}
      {hasMedicalHeals ? (
        <div className="rounded-md border border-rose-900/60 bg-rose-950/20 p-3 text-xs text-rose-200">
          <p className="font-semibold">
            Medizin-Zentrum — {Number.isFinite(medicalHealsRemaining) ? medicalHealsRemaining : "∞"} Heilung(en) diese Saison
          </p>
        </div>
      ) : null}
      {overview.squad.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
          Noch keine Spieler im Kader. Nach dem Draft erscheinen sie hier.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sortedSquad.map((owned) => {
            const card = mapOwnedPlayerToCardData(owned);
            const seasonNumber = Number(snapshot?.game.settings?.seasonNumber ?? 1);
            const isUnavailable = isPlayerUnavailableForSeason(seasonNumber, owned.unavailable_until_season);

            return (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/45 p-2" key={owned.id}>
                <PlayerCard disabled={owned.injured || isUnavailable} player={card} showArchetypes={archetypesEnabled} variant="draft" />
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <SmallInfo
                    label="Status"
                    value={
                      isUnavailable
                        ? "Gesperrt (Saison)"
                        : owned.injured
                          ? "Verletzt"
                          : owned.current_zone === "bench"
                            ? "Nicht aufgestellt"
                            : "Aufgestellt"
                    }
                  />
                  <SmallInfo label="Zone" value={owned.current_zone} />
                </div>
                {ownClub && snapshot ? (
                  <Button className="mt-2 h-7 w-full text-xs" onClick={() => setRenameTarget(owned)} type="button" variant="outline">
                    <Pencil size={13} aria-hidden />
                    Umbenennen
                  </Button>
                ) : null}
                {owned.injured && miraHealCharges > 0 && ownClub && snapshot ? (
                  <form action={healInjuredPlayerAction} className="mt-2">
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="club_id" type="hidden" value={ownClub.id} />
                    <input name="club_player_id" type="hidden" value={owned.id} />
                    <Button className="h-7 w-full text-xs" type="submit" variant="secondary">
                      Heilen (Mira)
                    </Button>
                  </form>
                ) : null}
                {owned.injured && hasMedicalHeals && ownClub && snapshot ? (
                  <form action={healPlayerMedicalAction} className="mt-2">
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="club_id" type="hidden" value={ownClub.id} />
                    <input name="club_player_id" type="hidden" value={owned.id} />
                    <Button className="h-7 w-full text-xs" type="submit" variant="secondary">
                      Heilen (Medizin)
                    </Button>
                  </form>
                ) : null}
                {nlzRespecAvailable &&
                ownClub &&
                snapshot &&
                owned.player.metadata &&
                typeof owned.player.metadata === "object" &&
                (owned.player.metadata as Record<string, unknown>).nlz_origin === true ? (
                  <form action={respecPlayerArchetypeAction} className="mt-2 space-y-1">
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="club_id" type="hidden" value={ownClub.id} />
                    <input name="club_player_id" type="hidden" value={owned.id} />
                    <select
                      className="h-7 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200"
                      name="archetype"
                      defaultValue={owned.player.attacker_archetype ?? owned.player.defender_archetype ?? "beta"}
                    >
                      {Object.entries(ARCHETYPE_META).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.attackLabel} / {meta.defenseLabel}
                        </option>
                      ))}
                    </select>
                    <Button className="h-7 w-full text-xs" type="submit" variant="secondary">
                      Archetyp umschmieden (NLZ)
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {renameTarget && ownClub && snapshot ? (
        <RenameClubPlayerModal
          onClose={() => setRenameTarget(null)}
          player={renameTarget}
          returnView="squad"
          snapshot={snapshot}
        />
      ) : null}
    </Panel>
  );
}

function RenameClubPlayerModal({
  onClose,
  player,
  returnView,
  snapshot,
}: {
  onClose: () => void;
  player: ClubPlayerSnapshot;
  returnView: "lineup" | "squad" | "training" | "transfer";
  snapshot: LobbySnapshot;
}) {
  const displayName = getClubPlayerDisplayName(player);
  const hasCustomName = Boolean(player.custom_name?.trim());

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-zinc-50">Spieler umbenennen</p>
            <p className="mt-1 text-sm text-zinc-400">Original: {player.player.display_name}</p>
          </div>
          <Button className="h-8 px-2" onClick={onClose} type="button" variant="outline">
            <X size={15} aria-hidden />
          </Button>
        </div>
        <form action={renameClubPlayerAction} className="mt-4 space-y-3">
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <input name="club_player_id" type="hidden" value={player.id} />
          <input name="return_view" type="hidden" value={returnView} />
          <label className="grid gap-1 text-xs text-zinc-400">
            Anzeigename
            <input
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300"
              defaultValue={displayName}
              maxLength={CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH}
              name="custom_name"
              placeholder={player.player.display_name}
            />
          </label>
          <p className="text-xs text-zinc-500">Leer speichern setzt den Namen auf den Originalnamen zurueck.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              Abbrechen
            </Button>
            <Button type="submit" variant="primary">
              Speichern
            </Button>
          </div>
        </form>
        {hasCustomName ? (
          <form action={renameClubPlayerAction} className="mt-2 flex justify-end">
            <input name="game_id" type="hidden" value={snapshot.game.id} />
            <input name="room_code" type="hidden" value={snapshot.game.room_code} />
            <input name="club_player_id" type="hidden" value={player.id} />
            <input name="return_view" type="hidden" value={returnView} />
            <input name="custom_name" type="hidden" value="" />
            <Button type="submit" variant="secondary">
              Zuruecksetzen
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ClubCardsPanel({
  overview,
  ownClub,
  snapshot,
}: {
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  ownClub: LobbyClub;
  snapshot: LobbySnapshot;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Mitarbeiter ({overview.staff.length}/3)</PanelTitle>
            <PanelDescription>Aktive Staff-Karten des Clubs.</PanelDescription>
          </div>
          <Crown size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        {overview.staff.length === 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">Noch keine Mitarbeiter.</div>
        ) : (
          <div className="space-y-2">
            {overview.staff.map((staff) => (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={staff.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-100">{staff.card.display_name}</p>
                    <p className="mt-1 text-xs text-zinc-400">{describeStaffEffects(staff.card.effects)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{staff.card.price ? formatMoney(staff.card.price) : "Staff"}</Badge>
                    <form action={dismissStaffAction}>
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="club_id" type="hidden" value={ownClub.id} />
                      <input name="club_staff_id" type="hidden" value={staff.id} />
                      <button
                        className="rounded p-1 text-zinc-500 transition-colors hover:bg-rose-900/40 hover:text-rose-300"
                        title={`${staff.card.display_name} entlassen`}
                        type="submit"
                      >
                        <UserMinus size={14} />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="game-changer">
        <PanelHeader>
          <div>
            <PanelTitle>Game-Changer &amp; Effekte</PanelTitle>
            <PanelDescription>Offene Effekte, Verlauf und Geheimwaffen.</PanelDescription>
          </div>
          <Sparkles size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <PendingEffectsList
          currentSeasonNumber={overview.season_number}
          effects={overview.pending_effects ?? []}
          gameChangers={overview.game_changers}
        />
        <DrawnGameChangersList
          key={overview.season_number}
          currentSeasonNumber={overview.season_number}
          gameChangers={overview.game_changers}
          pendingEffects={overview.pending_effects ?? []}
        />
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Geheimwaffen</h4>
          <CardList
            empty="Keine Geheimwaffen im Bestand."
            items={overview.game_changers
              .filter((gc) => gc.card.category === "secret_weapon" && !gc.used_at)
              .map((gameChanger) => ({
                id: gameChanger.id,
                detail: gameChanger.card.description || formatEffects(gameChanger.card.effects),
                meta: "Geheimwaffe",
                title: gameChanger.card.display_name,
              }))}
          />
        </div>
      </Panel>
    </div>
  );
}

function StaffMarketView({
  offer,
  ownClub,
  snapshot,
}: {
  offer: StaffOfferSnapshot;
  ownClub: LobbyClub;
  snapshot: LobbySnapshot;
}) {
  return (
    <Panel className="border-[var(--club-color)] bg-zinc-950/85" id="staff">
      <PanelHeader>
        <div>
          <PanelTitle>Mitarbeitermarkt</PanelTitle>
          <PanelDescription>Waehle einen Mitarbeiter zur Rekrutierung oder lehne beide ab.</PanelDescription>
        </div>
        <UserCheck size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {offer.offered_cards.map((card) => {
          const canAfford = ownClub.money >= card.price;
          return (
            <div className="rounded-md border border-zinc-700 bg-zinc-900/70 p-4" key={card.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-zinc-50">{card.display_name}</p>
                <Badge className={canAfford ? "" : "opacity-50"}>{formatMoney(card.price)}</Badge>
              </div>
              <p className="mt-2 text-sm text-zinc-300">{describeStaffEffects(card.effects)}</p>
              {!canAfford && <p className="mt-2 text-xs text-rose-400">Nicht genug Geld</p>}
              <form action={recruitStaffResolveAction} className="mt-4">
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="club_id" type="hidden" value={ownClub.id} />
                <input name="offer_id" type="hidden" value={offer.id} />
                <input name="chosen_card_id" type="hidden" value={card.id} />
                <Button className="w-full" disabled={!canAfford} type="submit">
                  Rekrutieren ({formatMoney(card.price)})
                </Button>
              </form>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <form action={recruitStaffResolveAction}>
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <input name="club_id" type="hidden" value={ownClub.id} />
          <input name="offer_id" type="hidden" value={offer.id} />
          <input name="chosen_card_id" type="hidden" value="" />
          <Button className="w-full" type="submit" variant="secondary">
            Beide ablehnen
          </Button>
        </form>
      </div>
    </Panel>
  );
}

function CardList({
  empty,
  items,
}: {
  empty: string;
  items: Array<{ detail: string; id: string; meta: string; title: string }>;
}) {
  if (items.length === 0) {
    return <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={item.id}>
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
  const ownStanding = ownClub ? season.standings.find((s) => s.participant.club_id === ownClub.id) ?? null : null;

  // Find own club's most recently completed fixture across all matchdays
  const ownLastFixture = ownClub
    ? [...season.fixtures]
        .filter(
          (f) =>
            f.status === "completed" &&
            (f.home_participant.club_id === ownClub.id || f.away_participant.club_id === ownClub.id),
        )
        .sort((a, b) => b.matchday - a.matchday)[0] ?? null
    : null;
  // Only pin it if it's not already visible in the current matchday list
  const pinnedOwnFixture =
    ownLastFixture && !matchdayFixtures.some((f) => f.id === ownLastFixture.id) ? ownLastFixture : null;

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
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="matchday" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="overview">
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

        {ownStanding ? (
          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Meine Saisonbilanz</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-zinc-50">{ownStanding.match_points}</span>
                <span className="text-xs text-zinc-400">Punkte</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-zinc-50">{ownStanding.played}</span>
                <span className="text-xs text-zinc-400">gespielt</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-emerald-400">{ownStanding.wins}S</span>
                <span className="text-sm font-semibold text-zinc-400">{ownStanding.draws}U</span>
                <span className="text-sm font-semibold text-rose-400">{ownStanding.losses}N</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-zinc-200">{ownStanding.third_points_for}</span>
                <span className="text-xs text-zinc-500">:</span>
                <span className="text-sm font-semibold text-zinc-200">{ownStanding.third_points_against}</span>
                <span className="text-xs text-zinc-400">Drittelpunkte</span>
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      {pinnedOwnFixture ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
            <CalendarDays size={13} aria-hidden />
            Letztes eigenes Spiel (Spieltag {pinnedOwnFixture.matchday})
          </p>
          <FixtureCard fixture={pinnedOwnFixture} isHost={isHost} ownClub={ownClub} snapshot={snapshot} />
        </div>
      ) : null}

      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="secret-weapons">
        <PanelHeader>
          <div>
            <PanelTitle>Geheimwaffen</PanelTitle>
            <PanelDescription>
              Nach dem Lineup-Lock findest du Geheimwaffen direkt in deiner Spielkarte unten — vor dem Anpfiff einsetzen.
            </PanelDescription>
          </div>
        </PanelHeader>
      </Panel>

      <div className="grid gap-4" id="fixtures">
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
  const bothHumanLineupsLocked = home.kind === "human" && away.kind === "human" && fixture.home_lineup_locked && fixture.away_lineup_locked;
  const canLock = Boolean(ownSide && fixture.status !== "completed" && !ownLocked);
  const canResolveOwnCpuMatch = Boolean(ownSide && hasCpu && ownLocked && fixture.status !== "completed");
  const canHostResolvePvpMatch = Boolean(isHost && !hasCpu && bothHumanLineupsLocked && fixture.status !== "completed");
  const ownPowerSummary = getOwnLineupPowerSummary(snapshot, ownClub);
  const result = parseFixtureResult(fixture.result);

  // For PvP: build a fake "lineup" object from stored locked power so the opponent's
  // strengths become visible once both sides have locked their lineups.
  const makeLockedLineup = (def: number | null | undefined, mid: number | null | undefined, att: number | null | undefined) =>
    def != null && mid != null && att != null
      ? { def_stars: def, mid_stars: mid, att_stars: att, display_name: "", id: "" }
      : null;

  const homePvpLineup = !fixture.home_cpu_lineup && bothHumanLineupsLocked
    ? makeLockedLineup(fixture.home_locked_def, fixture.home_locked_mid, fixture.home_locked_att)
    : null;
  const awayPvpLineup = !fixture.away_cpu_lineup && bothHumanLineupsLocked
    ? makeLockedLineup(fixture.away_locked_def, fixture.away_locked_mid, fixture.away_locked_att)
    : null;

  const [showLockWarning, setShowLockWarning] = useState(false);
  const lockFormRef = useRef<HTMLFormElement>(null);

  const squad = ownSide ? (snapshot.club_overview?.squad ?? []) : [];
  const hasInjuredInLineup = squad.some((p) => p.injured && p.current_zone !== "bench");
  const healthyStarters = squad.filter((p) => !p.injured && p.current_zone !== "bench").length;
  const hasIncompleteLineup = healthyStarters < 9;
  const hasLineupWarning = hasInjuredInLineup || hasIncompleteLineup;

  // PvP state machine
  const isPvP = !hasCpu && home.kind === "human" && away.kind === "human";
  const matchState = fixture.match_state ?? "scheduled";
  const currentThird = fixture.current_third ?? 0;
  const ownReady = ownSide === "home" ? fixture.home_ready_for_next_third : ownSide === "away" ? fixture.away_ready_for_next_third : false;
  const opponentReady = ownSide === "home" ? fixture.away_ready_for_next_third : ownSide === "away" ? fixture.home_ready_for_next_third : false;
  const secretWeapons = (snapshot.club_overview?.game_changers ?? []).filter(
    (gc) => gc.card.category === "secret_weapon" && !gc.used_at,
  );
  const playedWindowsForFixture = new Set<string>(
    (snapshot.club_overview?.game_changers ?? [])
      .filter((gc) => gc.card.category === "secret_weapon" && gc.fixture_id === fixture.id)
      .map((gc) => gc.applied_window ?? (gc.card.play_window ?? "before_match")),
  );
  const ownSquad = snapshot.club_overview?.squad ?? [];
  const partialThirds = ((fixture.partial_result as { thirds?: unknown[] } | null)?.thirds ?? []) as FixtureThird[];
  const partialModifiers = (fixture.partial_result as { pending_modifiers?: ZoneModifier[] } | null)?.pending_modifiers;
  const seasonZoneBoostsByClub = snapshot.season?.next_match_zone_boosts_by_club_id ?? {};
  const homeDisplayZoneBoosts = resolveDisplayZoneBoosts({
    clubId: home.club_id,
    partialModifiers,
    seasonBoostsByClubId: seasonZoneBoostsByClub,
    side: "home",
  });
  const awayDisplayZoneBoosts = resolveDisplayZoneBoosts({
    clubId: away.club_id,
    partialModifiers,
    seasonBoostsByClubId: seasonZoneBoostsByClub,
    side: "away",
  });
  const homeClubColor = snapshot.clubs.find((club) => club.id === home.club_id)?.club_color ?? null;
  const awayClubColor = snapshot.clubs.find((club) => club.id === away.club_id)?.club_color ?? null;

  // For PvP, suppress the old "Host resolves PvP" button — the new state machine handles it
  const canHostResolvePvpMatchLegacy = canHostResolvePvpMatch && !isPvP;

  const isOwnDraw = fixture.status === "completed" && ownSide && fixture.home_score != null && fixture.away_score != null && fixture.home_score === fixture.away_score;
  const tippyThreshold = snapshot.club_overview?.staff.reduce((min, s) => {
    const e = (s.card.effects as Array<{ type: string; threshold?: number }>).find((eff) => eff.type === "draw_reroll");
    return e ? Math.min(min, e.threshold ?? 8) : min;
  }, Infinity) ?? Infinity;
  const opponentClubId = ownSide === "home" ? away.club_id : ownSide === "away" ? home.club_id : null;
  const opponentName =
    ownSide === "home" ? away.display_name : ownSide === "away" ? home.display_name : "";
  const liveOpponentLineup =
    snapshot.season?.opponent_locked_lineups?.find((entry) => entry.fixture_id === fixture.id)?.lineup ?? null;
  const topPlayersByClubId = snapshot.season?.opponent_top_players_by_club_id ?? {};
  const homeTopPlayers =
    home.kind === "human" && home.club_id ? topPlayersByClubId[home.club_id] ?? [] : [];
  const awayTopPlayers =
    away.kind === "human" && away.club_id ? topPlayersByClubId[away.club_id] ?? [] : [];

  function handleLockClick() {
    if (hasLineupWarning) {
      setShowLockWarning(true);
    } else {
      lockFormRef.current?.requestSubmit();
    }
  }

  return (
    <div className="space-y-3">
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
              lineup={fixture.home_cpu_lineup ?? homePvpLineup}
              participant={{ ...home, club_color: homeClubColor }}
              powerSummary={home.club_id === ownClub?.id && fixture.home_lineup_locked ? ownPowerSummary : null}
              score={fixture.home_score}
              thirdPoints={fixture.home_third_points}
              topPlayers={homeTopPlayers}
              zoneBoosts={homeDisplayZoneBoosts}
            />
            <FixtureSideCard
              locked={fixture.away_lineup_locked}
              lineup={fixture.away_cpu_lineup ?? awayPvpLineup}
              participant={{ ...away, club_color: awayClubColor }}
              powerSummary={away.club_id === ownClub?.id && fixture.away_lineup_locked ? ownPowerSummary : null}
              score={fixture.away_score}
              thirdPoints={fixture.away_third_points}
              topPlayers={awayTopPlayers}
              zoneBoosts={awayDisplayZoneBoosts}
            />
          </div>

          {isPvP && snapshot.game.settings.archetypes_enabled !== false ? (
            <ArchetypeScoutPanel away={away} home={home} snapshot={snapshot} />
          ) : null}

          {(home.kind === "human" || away.kind === "human") && (result ?? partialThirds.length > 0) ? (
            <MatchResultDetail
              away={away}
              events={result?.events ?? []}
              fixture={fixture}
              home={home}
              snapshot={snapshot}
              thirds={result?.thirds ?? partialThirds}
            />
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="space-y-2 text-sm text-zinc-400">
            <p>
              {ownSide ? (ownLocked ? "Deine Aufstellung ist gelockt." : "Locke deine Aufstellung fuer dieses Match.") : "Du bist in diesem Fixture Zuschauer."}
            </p>
            <p>CPU-Aufstellungen werden stabil am Fixture gespeichert.</p>
          </div>
          {isOwnDraw && isFinite(tippyThreshold) && ownClub ? (
            <div className="rounded-md border border-violet-700 bg-violet-950/30 p-3 text-xs">
              <p className="font-semibold text-violet-300">Tippy aktivieren?</p>
              <p className="mt-1 text-violet-400">Wuerfel 2W6 — ab {tippyThreshold}+ zaehlt als Sieg.</p>
              <form action={triggerDrawRerollAction} className="mt-2">
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="club_id" type="hidden" value={ownClub.id} />
                <input name="fixture_id" type="hidden" value={fixture.id} />
                <Button className="w-full" type="submit" variant="secondary">
                  Neu wuerfeln (Tippy)
                </Button>
              </form>
            </div>
          ) : null}
          <div className="space-y-2">
            {canLock ? (
              <>
                <form action={lockFixtureLineupAction} className="hidden" ref={lockFormRef}>
                  <input name="game_id" type="hidden" value={snapshot.game.id} />
                  <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                  <input name="fixture_id" type="hidden" value={fixture.id} />
                </form>
                {!showLockWarning ? (
                  <Button className="w-full" onClick={handleLockClick} type="button" variant="primary">
                    Aufstellung locken
                  </Button>
                ) : (
                  <div className="rounded-md border border-amber-700 bg-amber-950/30 p-3">
                    <p className="text-sm font-semibold text-amber-200">Aufstellung pruefen</p>
                    <div className="mt-2 space-y-1 text-sm text-amber-200/80">
                      {hasInjuredInLineup ? (
                        <p>Ein oder mehrere Spieler in deiner Aufstellung sind verletzt und werden nicht eingesetzt.</p>
                      ) : null}
                      {hasIncompleteLineup ? (
                        <p>Deine Aufstellung hat nicht genug gesunde Spieler fuer alle Formationsslots.</p>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-amber-200/60">Du kannst die Aufstellung jetzt noch anpassen.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="border-amber-700 text-amber-100 hover:bg-amber-950"
                        onClick={() => lockFormRef.current?.requestSubmit()}
                        type="button"
                        variant="outline"
                      >
                        Trotzdem locken
                      </Button>
                      <a href={`/games/${snapshot.game.room_code}?view=lineup`}>
                        <Button type="button" variant="secondary">
                          Aufstellung oeffnen
                        </Button>
                      </a>
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {/* PvP Pre-Match: both lineups locked, match not started yet */}
            {isPvP && bothHumanLineupsLocked && matchState === "scheduled" && ownSide ? (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">Beide Aufstellungen sind gelockt. Du kannst jetzt Geheimwaffen vor dem Anpfiff einsetzen.</p>
                <MatchCardsPanel
                  gameId={snapshot.game.id}
                  roomCode={snapshot.game.room_code}
                  fixtureId={fixture.id}
                  window="before_match"
                  cards={secretWeapons}
                  squad={ownSquad}
                  playedWindows={playedWindowsForFixture}
                />
                <form action={startMatchAction}>
                  <input name="game_id" type="hidden" value={snapshot.game.id} />
                  <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                  <input name="fixture_id" type="hidden" value={fixture.id} />
                  <Button className="w-full" type="submit" variant="primary">
                    Match starten
                  </Button>
                </form>
              </div>
            ) : null}

            {/* PvP In Progress */}
            {isPvP && matchState === "in_progress" && ownSide ? (
              <div className="space-y-3">
                <MatchCardsPanel
                  gameId={snapshot.game.id}
                  roomCode={snapshot.game.room_code}
                  fixtureId={fixture.id}
                  window="during_match"
                  cards={secretWeapons}
                  squad={ownSquad}
                  playedWindows={playedWindowsForFixture}
                />
                {!ownReady ? (
                  <form action={markReadyForNextThirdAction}>
                    <input name="game_id" type="hidden" value={snapshot.game.id} />
                    <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                    <input name="fixture_id" type="hidden" value={fixture.id} />
                    <Button className="w-full" type="submit" variant="primary">
                      {currentThird < 3 ? `Bereit fuer Drittel ${currentThird + 1}` : "Ergebnis bestaetigen"}
                    </Button>
                  </form>
                ) : (
                  <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-2 text-center text-xs text-zinc-400">
                    {opponentReady ? "Beide bereit – Drittel laeuft..." : "Warte auf Gegner..."}
                  </div>
                )}
              </div>
            ) : null}

            {/* After match: active cards (e.g. Sieg oder Spielabbruch) */}
            {fixture.status === "completed" && ownSide ? (
              <AfterMatchCards
                gameId={snapshot.game.id}
                roomCode={snapshot.game.room_code}
                fixtureId={fixture.id}
                cards={secretWeapons}
                squad={ownSquad}
                playedWindows={playedWindowsForFixture}
                ownLost={Boolean(
                  fixture.home_score != null && fixture.away_score != null &&
                  (ownSide === "home" ? fixture.home_score < fixture.away_score : fixture.away_score < fixture.home_score),
                )}
                retroWinResult={(fixture.retro_win_result as { rolls?: number[]; success?: boolean } | null) ?? null}
              />
            ) : null}

            {canResolveOwnCpuMatch || canHostResolvePvpMatchLegacy ? (
              <form action={resolveFixtureAction}>
                <input name="game_id" type="hidden" value={snapshot.game.id} />
                <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                <input name="fixture_id" type="hidden" value={fixture.id} />
                <Button className="w-full" type="submit">
                  Match simulieren
                </Button>
              </form>
            ) : null}
            {!canLock && !canResolveOwnCpuMatch && !canHostResolvePvpMatchLegacy && !(isPvP && matchState !== "completed" && ownSide) ? (
              <Button className="w-full" disabled variant="outline">
                {fixture.status === "completed" ? "Fertig" : "Warten"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
    {ownSide && ownClub ? (
      <OpponentIntelPanel
        analyticsLevel={ownClub.analytics_hub_level ?? 0}
        fixtures={snapshot.season?.fixtures ?? []}
        liveLineup={liveOpponentLineup}
        opponentClubId={opponentClubId}
        opponentName={opponentName}
      />
    ) : null}
    </div>
  );
}

function ArchetypeScoutPanel({
  away,
  home,
  snapshot,
}: {
  away: SeasonFixtureSnapshot["away_participant"];
  home: SeasonFixtureSnapshot["home_participant"];
  snapshot: LobbySnapshot;
}) {
  const homeScout = buildParticipantArchetypeScout(snapshot, home.club_id, home.display_name);
  const awayScout = buildParticipantArchetypeScout(snapshot, away.club_id, away.display_name);

  if (!homeScout && !awayScout) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/45 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Archetype-Scout</p>
          <p className="text-sm font-semibold text-zinc-100">Moegliche Profile aus dem Kader</p>
        </div>
        <p className="text-xs text-zinc-500">Keine Starter-Vorschau</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {homeScout ? <ArchetypeScoutCard scout={homeScout} /> : null}
        {awayScout ? <ArchetypeScoutCard scout={awayScout} /> : null}
      </div>
    </div>
  );
}

function buildParticipantArchetypeScout(
  snapshot: LobbySnapshot,
  clubId: string | null | undefined,
  fallbackName: string,
) {
  if (!clubId) return null;
  const clubSquad = snapshot.club_squads?.find((entry) => entry.club.id === clubId);
  if (!clubSquad) return null;

  return buildArchetypeScoutFromSquad(clubSquad.squad, clubSquad.club.club_name || fallbackName);
}

function TableView({ ownClub, snapshot }: { ownClub: LobbyClub | undefined; snapshot: LobbySnapshot }) {
  const season = snapshot.season;
  const hasActiveSeason = Boolean(season && !season.setup_error);
  const clubColorById = new Map(snapshot.clubs.map((club) => [club.id, club.club_color ?? null]));

  type BoardEntry = { club_color: string | null; club_id: string; club_name: string; season_score: number };
  const boardEntries: BoardEntry[] = hasActiveSeason
    ? season!.manager_standings.map((s) => ({
        club_color: clubColorById.get(s.club_id) ?? null,
        club_id: s.club_id,
        club_name: s.club_name,
        season_score: s.stage_score,
      }))
    : snapshot.clubs.map((c) => ({
        club_color: c.club_color ?? null,
        club_id: c.id,
        club_name: c.club_name,
        season_score: Math.round(c.squad_stars ?? 0),
      }));

  const BOARD_MIN = 20;
  const BOARD_MAX = 100;
  const positions = Array.from({ length: BOARD_MAX - BOARD_MIN + 1 }, (_, i) => BOARD_MIN + i);
  const scoreMap = new Map<number, BoardEntry[]>();
  for (const entry of boardEntries) {
    const pos = Math.min(Math.max(entry.season_score, BOARD_MIN), BOARD_MAX);
    const existing = scoreMap.get(pos) ?? [];
    existing.push(entry);
    scoreMap.set(pos, existing);
  }
  const clubsBelowBoard = boardEntries.filter((e) => e.season_score < BOARD_MIN);
  const clubsAboveBoard = boardEntries.filter((e) => e.season_score > BOARD_MAX);

  const BOARD_ZONES = [
    {
      label: "Neu aufgestiegen",
      min: BOARD_MIN,
      max: 39,
      emptyBorder: "border-rose-950",
      emptyText: "text-rose-900",
      occupiedBorder: "border-rose-600",
      occupiedBg: "bg-rose-950/70",
      occupiedText: "text-rose-200",
      headerText: "text-rose-400",
      headerLine: "bg-rose-950",
      legendDot: "bg-rose-500",
    },
    {
      label: "Etabliert",
      min: 40,
      max: 59,
      emptyBorder: "border-amber-950",
      emptyText: "text-amber-900",
      occupiedBorder: "border-amber-500",
      occupiedBg: "bg-amber-950/70",
      occupiedText: "text-amber-200",
      headerText: "text-amber-400",
      headerLine: "bg-amber-950",
      legendDot: "bg-amber-500",
    },
    {
      label: "Mittlerer Tabellenplatz",
      min: 60,
      max: 79,
      emptyBorder: "border-sky-950",
      emptyText: "text-sky-900",
      occupiedBorder: "border-sky-500",
      occupiedBg: "bg-sky-950/70",
      occupiedText: "text-sky-200",
      headerText: "text-sky-400",
      headerLine: "bg-sky-950",
      legendDot: "bg-sky-500",
    },
    {
      label: "Titelanwaerter",
      min: 80,
      max: BOARD_MAX,
      emptyBorder: "border-emerald-950",
      emptyText: "text-emerald-900",
      occupiedBorder: "border-emerald-500",
      occupiedBg: "bg-emerald-950/70",
      occupiedText: "text-emerald-200",
      headerText: "text-emerald-400",
      headerLine: "bg-emerald-950",
      legendDot: "bg-emerald-500",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="table" />
      <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="positions">
        <PanelHeader>
          <div>
            <PanelTitle>Superclub-Positionsboard</PanelTitle>
            <PanelDescription>
              {hasActiveSeason
                ? "Position = Kadersterne + Siegpunkte aus Spielen gegen andere Manager."
                : "Noch keine laufende Saison. Positionen basieren auf den aktuellen Kadernsternen."}
            </PanelDescription>
          </div>
          <Trophy size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>

        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
          {BOARD_ZONES.map((zone) => (
            <div className="flex items-center gap-1.5" key={zone.label}>
              <span className={cn("h-2.5 w-2.5 rounded-full", zone.legendDot)} />
              <span className="text-xs text-zinc-400">
                {zone.label} <span className="text-zinc-600">({zone.min}–{zone.max})</span>
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {BOARD_ZONES.map((zone) => {
            const zonePositions = positions.filter((p) => p >= zone.min && p <= zone.max);
            return (
              <div key={zone.label}>
                <div className="mb-2 flex items-center gap-2">
                  <div className={cn("h-px flex-1", zone.headerLine)} />
                  <span className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-widest", zone.headerText)}>
                    {zone.label} · {zone.min}–{zone.max}
                  </span>
                  <div className={cn("h-px flex-1", zone.headerLine)} />
                </div>
                <div className="grid grid-cols-10 gap-1.5">
                  {zonePositions.map((pos) => {
                    const clubsHere = scoreMap.get(pos) ?? [];
                    const ownIsHere = clubsHere.some((e) => e.club_id === ownClub?.id);
                    const hasClub = clubsHere.length > 0;
                    return (
                      <div
                        key={pos}
                        className={cn(
                          "relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-full border text-center",
                          ownIsHere
                            ? "border-[var(--club-color)] bg-[var(--club-color)]/20 ring-2 ring-[var(--club-color)]/40"
                            : hasClub
                              ? cn(zone.occupiedBorder, zone.occupiedBg)
                              : cn(zone.emptyBorder, "bg-zinc-900/20"),
                        )}
                        title={clubsHere.map((e) => `${e.club_name}: ${e.season_score}`).join(" · ")}
                      >
                        {hasClub ? (
                          <>
                            <ClubBadge
                              className="absolute inset-1 h-auto w-auto rounded-full border-0"
                              clubColor={clubsHere[0].club_color}
                              clubName={clubsHere[0].club_name}
                              imageClassName="p-[15%]"
                            />
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[7px] font-bold leading-tight text-white">
                              {pos}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className={cn(
                                "text-[10px] font-bold leading-none",
                                ownIsHere
                                  ? "text-[var(--club-color)]"
                                  : hasClub
                                    ? zone.occupiedText
                                    : zone.emptyText,
                              )}
                            >
                              {pos}
                            </span>
                            {clubsHere.length > 0 ? (
                              <span
                                className={cn(
                                  "mt-0.5 block w-full truncate px-0.5 text-[7px] font-medium leading-none",
                                  ownIsHere ? "text-[var(--club-color)]" : "text-zinc-400",
                                )}
                              >
                                {clubsHere.map((e) => (e.club_name.length > 5 ? `${e.club_name.substring(0, 4)}…` : e.club_name)).join("/")}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {clubsBelowBoard.length > 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Noch nicht auf dem Board (unter {BOARD_MIN}): {clubsBelowBoard.map((e) => `${e.club_name} (${e.season_score})`).join(", ")}
          </p>
        ) : null}
        {clubsAboveBoard.length > 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Position 100 ueberschritten: {clubsAboveBoard.map((e) => `${e.club_name} (${e.season_score})`).join(", ")}
          </p>
        ) : null}

        <div className="mt-5 border-t border-zinc-800 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Aktuelle Positionen</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...boardEntries]
              .sort((a, b) => b.season_score - a.season_score)
              .map((e) => {
                const isOwn = e.club_id === ownClub?.id;
                const zone = BOARD_ZONES.find((z) => e.season_score >= z.min && e.season_score <= z.max) ?? BOARD_ZONES[0];
                return (
                  <div
                    key={e.club_id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-2",
                      isOwn
                        ? "border-[var(--club-color)] bg-[var(--club-color)]/10"
                        : "border-zinc-800 bg-zinc-900/40",
                    )}
                  >
                    <ClubBadge className="rounded-full" clubColor={e.club_color} clubName={e.club_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-xs font-semibold", isOwn ? "text-[var(--club-color)]" : "text-zinc-200")}>
                        {e.club_name}
                      </p>
                      <p className={cn("text-[10px]", zone.headerText)}>{zone.label}</p>
                    </div>
                    <span className={cn("shrink-0 text-sm font-black tabular-nums", isOwn ? "text-[var(--club-color)]" : "text-zinc-200")}>
                      {e.season_score}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </Panel>

      {hasActiveSeason ? (
        <>
          <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="managers">
            <PanelHeader>
              <div>
                <PanelTitle>Managerwertung</PanelTitle>
                <PanelDescription>
                  Rangliste nach Siegpunkten (nur Manager-Spiele). Status und Attraktivitaet aus Kadersterne + Siegpunkte.
                </PanelDescription>
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
                    <th className="py-2 pr-3">Siegpunkte</th>
                    <th className="py-2 pr-3">Stufen-Score</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Attraktivitaet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {season!.manager_standings.map((standing) => (
                    <tr className="text-zinc-300" key={standing.club_id}>
                      <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.rank}</td>
                      <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.club_name}</td>
                      <td className="py-3 pr-3">{formatStars(standing.squad_stars)}</td>
                      <td className="py-3 pr-3">{standing.season_match_points}</td>
                      <td className="py-3 pr-3 text-base font-bold text-zinc-50">{standing.stage_score}</td>
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

          <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="league">
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
                  {season!.standings.map((standing) => {
                    const thirdDiff = standing.third_points_for - standing.third_points_against;
                    return (
                      <tr className="text-zinc-300" key={standing.participant_id}>
                        <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.rank}</td>
                        <td className="py-3 pr-3 font-semibold text-zinc-50">{standing.participant.display_name}</td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge tone={standing.participant.kind === "cpu" ? "blue" : "green"}>{standing.participant.kind === "cpu" ? "CPU" : "Manager"}</Badge>
                            {standing.participant.kind === "cpu" && standing.participant.cpu_strength_tier ? (
                              <CpuStrengthBadge tier={standing.participant.cpu_strength_tier} />
                            ) : null}
                          </div>
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
        </>
      ) : (
        <Panel className={cn("bg-zinc-950/85", season?.setup_error ? "border-amber-700" : "border-[var(--club-border)]")}>
          <PanelHeader>
            <div>
              <PanelTitle>Tabelle</PanelTitle>
              <PanelDescription>{season?.setup_error ?? "Managerwertung und Liga-Tabelle entstehen beim Start der Prematch-Phase."}</PanelDescription>
            </div>
            <Trophy size={18} className={season?.setup_error ? "text-amber-200" : "text-[var(--club-color)]"} aria-hidden />
          </PanelHeader>
        </Panel>
      )}
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
  const continentalCupEnabled = snapshot.game.settings.continental_cup_enabled !== false;
  const sponsoringEnabled = snapshot.game.settings.sponsoring_enabled !== false;
  const archetypesEnabled = snapshot.game.settings.archetypes_enabled !== false;

  return (
    <div className="space-y-4">
      <ViewGuidePanel roomCode={snapshot.game.room_code} view="settings" />
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

      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Spielregeln</PanelTitle>
            <PanelDescription>Diese Optionen gelten direkt fuer den laufenden Spielstand.</PanelDescription>
          </div>
          <Settings size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>
        <form action={updateGameSettingsAction} className="grid gap-3 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
          <input name="game_id" type="hidden" value={snapshot.game.id} />
          <input name="room_code" type="hidden" value={snapshot.game.room_code} />
          <input name="continental_cup_enabled" type="hidden" value="0" />
          <input name="sponsoring_enabled" type="hidden" value="0" />
          <input name="archetypes_enabled" type="hidden" value="0" />
          <FeatureToggle
            defaultChecked={continentalCupEnabled}
            disabled={!isHost}
            label="Continental Cup"
            name="continental_cup_enabled"
            text="Turnier nach geraden Saisons zwischen Saisonabschluss und Off-Season."
          />
          <FeatureToggle
            defaultChecked={sponsoringEnabled}
            disabled={!isHost}
            label="Sponsoring"
            name="sponsoring_enabled"
            text="Sponsorenvertraege, Sponsoren-Ziele und Sponsoren-Effekte."
          />
          <FeatureToggle
            defaultChecked={archetypesEnabled}
            disabled={!isHost}
            label="Archetypes"
            name="archetypes_enabled"
            text="Archetype-Duelle im Angriffsdrittel und passende Anzeigen."
          />
          {isHost ? (
            <Button className="h-11" type="submit">
              Speichern
            </Button>
          ) : (
            <Badge tone="neutral">Nur Host</Badge>
          )}
        </form>
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

function FeatureToggle({
  defaultChecked,
  disabled,
  label,
  name,
  text,
}: {
  defaultChecked: boolean;
  disabled?: boolean;
  label: string;
  name: string;
  text: string;
}) {
  return (
    <label className={cn("flex min-h-20 cursor-pointer items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-3", disabled ? "cursor-default opacity-70" : "")}>
      <input
        className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-lime-400 focus:ring-lime-300"
        defaultChecked={defaultChecked}
        disabled={disabled}
        name={name}
        type="checkbox"
        value="1"
      />
      <span>
        <span className="block text-sm font-semibold text-zinc-100">{label}</span>
        <span className="mt-1 block text-xs text-zinc-500">{defaultChecked ? "Aktiv" : "Ausgeschaltet"} - {text}</span>
      </span>
    </label>
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

  if (view === "continental") {
    return <ContinentalView isHost={props.isHost} ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "table") {
    return <TableView ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  if (view === "hall_of_fame") {
    return <HallOfFameView hallOfFame={props.snapshot.hall_of_fame} roomCode={props.snapshot.game.room_code} />;
  }

  if (view === "prestige") {
    return (
      <PrestigeView
        ownClubId={props.ownClub?.id}
        prestige={props.snapshot.prestige}
        roomCode={props.snapshot.game.room_code}
        snapshot={props.snapshot}
      />
    );
  }

  if (view === "game_end") {
    return <GameEndView ownClub={props.ownClub} snapshot={props.snapshot} />;
  }

  return null;
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

    return getClubPlayerDisplayName(a).localeCompare(getClubPlayerDisplayName(b), "de");
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

function getPlayerPositionLabel(player: DraftPlayerRow) {
  return getPositionLabel((player.eligible_positions?.length ? player.eligible_positions : [player.position]) as PlayerCardPosition[]);
}

function formatTransferPlayerMeta(player: ClubPlayerSnapshot | null | undefined): string {
  if (!player) {
    return "–";
  }

  return `${getPlayerPositionLabel(player.player)} · ${formatStars(Number(player.current_stars))}`;
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

function describeStaffEffects(effects: unknown[]): string {
  if (!Array.isArray(effects) || effects.length === 0) return "Keine Effekte.";
  return effects
    .map((e) => {
      if (!e || typeof e !== "object") return "Effekt";
      const eff = e as Record<string, unknown>;
      const fmt = (v: unknown) => formatMoney(Number(v));
      switch (eff.type) {
        case "zone_bonus": return `+${eff.stars} ${String(eff.zone)}`;
        case "dice_zone_bonus": return `+${eff.stars} Wuerfelbonus (je Drittel)`;
        case "captain_boost_extra": return `+${eff.stars} Captain-Boost`;
        case "wage_multiplier": return `Gehaelter ×${eff.factor}`;
        case "auction_discount": return `${fmt(eff.amount)} Rabatt (Deadline Day)`;
        case "scouting_extra_cards": return `+${eff.cards} Scouting-Karte(n)`;
        case "season_income_bonus": return `+${fmt(eff.amount)} pro Saison`;
        case "investment_action_bonus": return `+${eff.extra} Investment-Aktion`;
        case "attractiveness_bonus": return `+${eff.stars} Attraktivitaet`;
        case "status_tier_up": return `+${eff.tiers} Statusstufe (Stadion & Attraktivitaet)`;
        case "chemistry_multiplier": return `Chemie-Bonus ×${eff.factor}`;
        case "training_player_bonus": return `+${eff.players} Trainingsplatz`;
        case "new_signing_star_bonus": return `+${eff.stars} Stern auf neue Zugaenge`;
        case "injury_heal_manual": return `${eff.perMatchday} Heilung/Spieltag`;
        case "draw_reroll": return `Unentschieden: neu wuerfeln (${eff.threshold}+ = Sieg)`;
        default: return String(eff.type).replaceAll("_", " ");
      }
    })
    .join(" · ");
}

function getOwnLineupPowerSummary(snapshot: LobbySnapshot, ownClub?: LobbyClub): LineupPowerSummary | null {
  const squad = snapshot.club_overview?.squad;

  if (!squad) {
    return null;
  }

  const staffEffects = (snapshot.club_overview?.staff ?? []).flatMap(
    (s) => s.card.effects as Array<{ type: string; zone?: string; stars?: number }>,
  );

  const captain =
    ownClub?.captain_club_player_id
      ? {
          clubPlayerId: ownClub.captain_club_player_id,
          boost: Math.max(0, Math.trunc(Number(ownClub.captain_boost_rank ?? 0))),
        }
      : null;

  return calculateLineupPower(
    squad.map((owned) => ({
      id: owned.id,
      chemistry_left: owned.player.chemistry_left,
      chemistry_right: owned.player.chemistry_right,
      current_stars: owned.current_stars,
      current_zone: owned.current_zone,
      injured: owned.injured,
      lineup_slot: owned.lineup_slot,
      position: owned.player.position,
      positions: owned.player.eligible_positions?.length
        ? owned.player.eligible_positions
        : owned.player.position
          ? [owned.player.position]
          : undefined,
    })),
    staffEffects,
    captain,
  );
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

