"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import {
  Activity,
  Banknote,
  CalendarDays,
  ChevronsRight,
  CircleDot,
  ClipboardList,
  Crown,
  Dumbbell,
  Eye,
  Gavel,
  Pause,
  Play,
  Shield,
  Shuffle,
  Sparkles,
  Trophy,
  Users,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { createDemoGame, type DemoGame } from "@/lib/game/demo";
import {
  FORMATION_COUNTS,
  PHASE_LABELS,
  calculateSquadStars,
  canUpgradeInvestment,
  getDraftPickOrder,
  money,
  validateFormation,
} from "@/lib/game/rules";
import type { Club, Lineup, PlayerCard, TacticalZone } from "@/lib/game/types";
import { cn } from "@/lib/utils";

type TabId = "overview" | "draft" | "club" | "market" | "match" | "table";

const tabs: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Dashboard", icon: Activity },
  { id: "draft", label: "Draft", icon: Shuffle },
  { id: "club", label: "Club", icon: Dumbbell },
  { id: "market", label: "Markt", icon: Gavel },
  { id: "match", label: "Matchday", icon: Shield },
  { id: "table", label: "Tabelle", icon: Trophy },
];

const toneByClubColor: Record<string, "green" | "blue" | "amber" | "red" | "neutral"> = {
  rose: "red",
  sky: "blue",
  emerald: "green",
  amber: "amber",
};

const clubStatusLabels: Record<Club["status"], string> = {
  newly_promoted: "Newly Promoted",
  established: "Established",
  mid_table: "Mid Table",
  title_contender: "Title Contender",
};

export function SuperclubApp() {
  const demo = useMemo(() => createDemoGame(), []);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedClubId, setSelectedClubId] = useState(demo.clubs[0].id);
  const selectedClub = demo.clubs.find((club) => club.id === selectedClubId) ?? demo.clubs[0];
  const { isLoaded, isSignedIn } = useUser();

  return (
    <main className="min-h-screen bg-[#07120d] text-zinc-100">
      <div className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">Room {demo.game.settings.roomCode}</Badge>
                <Badge>{PHASE_LABELS[demo.game.status]}</Badge>
                <Badge>Saison {demo.game.settings.seasonNumber}</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal text-zinc-50 sm:text-3xl">
                Superclub Private Edition
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {isLoaded && !isSignedIn ? (
                <>
                  <SignInButton mode="modal">
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                      type="button"
                    >
                      Anmelden
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-lime-300 px-4 text-sm font-medium text-zinc-950 transition hover:bg-lime-200"
                      type="button"
                    >
                      Registrieren
                    </button>
                  </SignUpButton>
                </>
              ) : null}
              {isLoaded && isSignedIn ? <UserButton /> : null}
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                href="/lobby"
              >
                <Users size={16} aria-hidden />
                Lobby
              </a>
              <Button variant="secondary">
                <Pause size={16} aria-hidden />
                Pause
              </Button>
              <Button variant="outline">
                <Wand2 size={16} aria-hidden />
                Phase Sync
              </Button>
              <Button>
                <Play size={16} aria-hidden />
                Start
              </Button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
                    activeTab === tab.id
                      ? "border-lime-300 bg-lime-300 text-zinc-950"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                  )}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  type="button"
                >
                  <Icon size={16} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
        <aside className="space-y-4">
          <ClubSwitcher demo={demo} selectedClubId={selectedClubId} onSelect={setSelectedClubId} />
          <PhaseRail activePhase={demo.game.status} />
        </aside>

        <section className="min-w-0">
          {activeTab === "overview" ? <OverviewTab demo={demo} selectedClub={selectedClub} /> : null}
          {activeTab === "draft" ? <DraftTab demo={demo} /> : null}
          {activeTab === "club" ? <ClubTab demo={demo} club={selectedClub} /> : null}
          {activeTab === "market" ? <MarketTab demo={demo} /> : null}
          {activeTab === "match" ? <MatchTab demo={demo} /> : null}
          {activeTab === "table" ? <TableTab demo={demo} /> : null}
        </section>
      </div>
    </main>
  );
}

function ClubSwitcher({
  demo,
  selectedClubId,
  onSelect,
}: {
  demo: DemoGame;
  selectedClubId: string;
  onSelect: (clubId: string) => void;
}) {
  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>Manager</PanelTitle>
          <PanelDescription>{demo.clubs.length} Clubs verbunden</PanelDescription>
        </div>
        <Users size={18} className="text-zinc-500" aria-hidden />
      </PanelHeader>
      <div className="space-y-2">
        {demo.clubs.map((club) => {
          const squadStars = calculateSquadStars(club.id, demo.clubPlayers, demo.playerCatalog);

          return (
            <button
              key={club.id}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition",
                selectedClubId === club.id ? "border-lime-300 bg-lime-300/10" : "border-zinc-800 bg-zinc-900/70 hover:bg-zinc-900",
              )}
              onClick={() => onSelect(club.id)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-zinc-100">{club.name}</span>
                <span className="block truncate text-xs text-zinc-500">{club.managerName}</span>
              </span>
              <Badge tone={toneByClubColor[club.color]}>{squadStars} Sterne</Badge>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function PhaseRail({ activePhase }: { activePhase: string }) {
  const phaseKeys = [
    "lobby",
    "draft",
    "offseason_finance",
    "offseason_training",
    "offseason_scouting",
    "offseason_investments",
    "deadline_day",
    "prematch",
    "match",
    "season_end",
  ];

  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>State Machine</PanelTitle>
          <PanelDescription>Regelphasen</PanelDescription>
        </div>
        <ChevronsRight size={18} className="text-zinc-500" aria-hidden />
      </PanelHeader>
      <ol className="space-y-2">
        {phaseKeys.map((phase) => (
          <li key={phase} className="flex items-center gap-2 text-xs">
            <CircleDot
              size={13}
              className={phase === activePhase ? "text-lime-300" : "text-zinc-700"}
              fill={phase === activePhase ? "currentColor" : "none"}
              aria-hidden
            />
            <span className={phase === activePhase ? "text-zinc-50" : "text-zinc-500"}>{PHASE_LABELS[phase]}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function OverviewTab({ demo, selectedClub }: { demo: DemoGame; selectedClub: Club }) {
  const squadStars = calculateSquadStars(selectedClub.id, demo.clubPlayers, demo.playerCatalog);
  const finance = demo.finance[selectedClub.id];
  const turnClub = demo.clubs.find((club) => club.id === demo.currentDraftTurn?.clubId);
  const currentPick = demo.currentDraftTurn ? demo.currentDraftTurn.pickIndex + 1 : undefined;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Banknote} label="Aktuelles Budget" value={money(selectedClub.money)} detail={`Offseason netto ${money(finance.net)}`} />
        <Metric icon={Sparkles} label="Staerkelevel" value={`${squadStars} Sterne`} detail="gesamter Kader" />
        <Metric icon={Crown} label="Positionierung" value={`#${selectedClub.seasonRank}`} detail={clubStatusLabels[selectedClub.status]} />
        <Metric icon={Shuffle} label="Am Zug" value={turnClub?.name ?? "-"} detail={currentPick ? `Draft Pick ${currentPick}` : "wartet"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Matchday Feed</PanelTitle>
              <PanelDescription>{demo.match.homeClubId} vs {demo.match.awayClubId}</PanelDescription>
            </div>
            <CalendarDays size={18} className="text-zinc-500" aria-hidden />
          </PanelHeader>
          <MatchTimeline demo={demo} compact />
        </Panel>

        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Naechste Aktionen</PanelTitle>
              <PanelDescription>Host-Steuerung</PanelDescription>
            </div>
            <ClipboardList size={18} className="text-zinc-500" aria-hidden />
          </PanelHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Draft Board", "16 offene Karten"],
              ["Finanzen", "Praemie + Stadion - Gehaelter"],
              ["Scouting", "Levelbasierte Ziehungen"],
              ["Lineup Lock", "verdeckte Aufstellungen"],
            ].map(([title, value]) => (
              <div key={title} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-sm font-medium text-zinc-100">{title}</p>
                <p className="mt-1 text-xs text-zinc-500">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DraftTab({ demo }: { demo: DemoGame }) {
  const clubIds = demo.clubs.map((club) => club.id);
  const nextOrder = getDraftPickOrder(clubIds, demo.draftRound.roundIndex + 1, 16);
  const pickedIds = new Set(demo.draftRound.picks.map((pick) => pick.playerId));

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Draft Board</PanelTitle>
            <PanelDescription>Runde {demo.draftRound.roundIndex + 1} von {demo.clubs.length}</PanelDescription>
          </div>
          <Badge tone="green">{demo.draftRound.picks.length}/16 Picks</Badge>
        </PanelHeader>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {demo.draftRound.boardPlayerIds.map((playerId) => {
            const player = demo.playerCatalog[playerId];
            return <PlayerTile key={playerId} player={player} disabled={pickedIds.has(playerId)} />;
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Aktuelle Pick-Reihenfolge</PanelTitle>
              <PanelDescription>Startmanager rotiert pro Draft-Runde</PanelDescription>
            </div>
            <Shuffle size={18} className="text-zinc-500" aria-hidden />
          </PanelHeader>
          <OrderList clubIds={demo.draftRound.pickOrderClubIds.slice(0, 16)} clubs={demo.clubs} activeIndex={demo.draftRound.picks.length} />
        </Panel>
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Naechste Runde</PanelTitle>
              <PanelDescription>Manager 2 startet</PanelDescription>
            </div>
            <ChevronsRight size={18} className="text-zinc-500" aria-hidden />
          </PanelHeader>
          <OrderList clubIds={nextOrder.slice(0, 8)} clubs={demo.clubs} activeIndex={0} />
        </Panel>
      </div>
    </div>
  );
}

function ClubTab({ demo, club }: { demo: DemoGame; club: Club }) {
  const finance = demo.finance[club.id];
  const training = demo.training[club.id];
  const scouting = demo.scouting[club.id];
  const squad = demo.clubPlayers.filter((owned) => owned.clubId === club.id);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Banknote} label="Finanzen" value={money(finance.net)} detail={`${money(finance.placementReward)} + ${money(finance.stadiumIncome)} - ${money(finance.wages)}`} />
        <Metric icon={Dumbbell} label="Training" value={`Level ${club.investments.training}`} detail={`${training.players} Spieler, max ${training.maxStarsPerPlayer} Sterne`} />
        <Metric icon={Eye} label="Scouting" value={`Level ${club.investments.scouting}`} detail={`${scouting.players} Karten ziehen`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Investments</PanelTitle>
              <PanelDescription>max. 2 Aktionen, keine Kategorie doppelt</PanelDescription>
            </div>
            <Dumbbell size={18} className="text-zinc-500" aria-hidden />
          </PanelHeader>
          <div className="space-y-3">
            {(["training", "scouting", "stadium", "staff"] as const).map((action) => {
              const result = canUpgradeInvestment(club, action, ["training"]);
              const level = action === "staff" ? club.staff.length : club.investments[action];
              return (
                <div key={action} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                  <div>
                    <p className="text-sm font-medium capitalize text-zinc-100">{action}</p>
                    <p className="text-xs text-zinc-500">Status {level}</p>
                  </div>
                  <Badge tone={result.ok ? "green" : "neutral"}>{result.ok && "cost" in result ? money(result.cost) : "gesperrt"}</Badge>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Kader</PanelTitle>
              <PanelDescription>{squad.length}/23 Spieler</PanelDescription>
            </div>
            <Users size={18} className="text-zinc-500" aria-hidden />
          </PanelHeader>
          <div className="overflow-hidden rounded-md border border-zinc-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Spieler</th>
                  <th className="px-3 py-2 text-left">Pos</th>
                  <th className="px-3 py-2 text-left">Stars</th>
                  <th className="px-3 py-2 text-left">Zone</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                {squad.slice(0, 10).map((owned) => {
                  const player = demo.playerCatalog[owned.playerId];
                  return (
                    <tr key={owned.id}>
                      <td className="px-3 py-2 font-medium text-zinc-100">{player.name}</td>
                      <td className="px-3 py-2 text-zinc-400">{player.position}</td>
                      <td className="px-3 py-2 text-zinc-300">{owned.currentStars}/{player.baseStars + player.potentialStars}</td>
                      <td className="px-3 py-2 text-zinc-400">{owned.currentZone}</td>
                      <td className="px-3 py-2">{owned.injured ? <Badge tone="red">verletzt</Badge> : <Badge>fit</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MarketTab({ demo }: { demo: DemoGame }) {
  const player = demo.playerCatalog[demo.auction.playerId];
  const winner = demo.clubs.find((club) => club.id === demo.resolvedAuction.winningClubId);

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Deadline Day</PanelTitle>
            <PanelDescription>{demo.clubs.length + 1} Auktionen pro Saison</PanelDescription>
          </div>
          <Gavel size={18} className="text-zinc-500" aria-hidden />
        </PanelHeader>
        <PlayerTile player={player} featured />
        <div className="mt-4 grid gap-2">
          {demo.auction.bids.map((bid) => {
            const club = demo.clubs.find((item) => item.id === bid.clubId);
            return (
              <div key={bid.clubId} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
                <span className="text-sm font-medium text-zinc-100">{club?.name}</span>
                <Badge tone={bid.locked ? "green" : "neutral"}>{bid.amount > 0 ? money(bid.amount) : "passt"}</Badge>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Auktionsauflösung</PanelTitle>
            <PanelDescription>Gleichstand nach Kaderstaerke</PanelDescription>
          </div>
          <Crown size={18} className="text-zinc-500" aria-hidden />
        </PanelHeader>
        <div className="rounded-md border border-lime-300/40 bg-lime-300/10 p-4">
          <p className="text-sm text-zinc-400">Gewinner</p>
          <p className="mt-1 text-2xl font-semibold text-lime-200">{winner?.name ?? "Kein Zuschlag"}</p>
          <p className="mt-3 text-sm text-zinc-400">
            Mindestpreis {money(demo.auction.minimumBid)}. Gleich hohe Gebote werden ueber die staerkere Kaderwertung entschieden.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {demo.staffMarket.map((staff) => (
            <div key={staff.id} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-sm font-medium text-zinc-100">{staff.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{money(staff.price)}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MatchTab({ demo }: { demo: DemoGame }) {
  const homeClub = demo.clubs.find((club) => club.id === demo.match.homeClubId) ?? demo.clubs[0];
  const awayClub = demo.clubs.find((club) => club.id === demo.match.awayClubId) ?? demo.clubs[1];
  const homeLineup = demo.lineups[homeClub.id];
  const awayLineup = demo.lineups[awayClub.id];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PitchPanel club={homeClub} lineup={homeLineup} demo={demo} />
        <PitchPanel club={awayClub} lineup={awayLineup} demo={demo} />
      </div>
      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Matchauflösung</PanelTitle>
            <PanelDescription>2W6 + Zone + Chemie + Boosts</PanelDescription>
          </div>
          <Shield size={18} className="text-zinc-500" aria-hidden />
        </PanelHeader>
        <MatchTimeline demo={demo} />
      </Panel>
    </div>
  );
}

function TableTab({ demo }: { demo: DemoGame }) {
  const sorted = [...demo.clubs].sort((a, b) => b.points - a.points);

  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>League Table</PanelTitle>
          <PanelDescription>Saisonpunkte und Clubstatus</PanelDescription>
        </div>
        <Trophy size={18} className="text-zinc-500" aria-hidden />
      </PanelHeader>
      <div className="overflow-hidden rounded-md border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Club</th>
              <th className="px-3 py-2 text-left">Punkte</th>
              <th className="px-3 py-2 text-left">Budget</th>
              <th className="px-3 py-2 text-left">SuperCup</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {sorted.map((club, index) => (
              <tr key={club.id}>
                <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                <td className="px-3 py-2 font-medium text-zinc-100">{club.name}</td>
                <td className="px-3 py-2 text-zinc-300">{club.points}</td>
                <td className="px-3 py-2 text-zinc-300">{money(club.money)}</td>
                <td className="px-3 py-2 text-zinc-300">{club.superCupCards}/3</td>
                <td className="px-3 py-2"><Badge>{club.status.replace("_", " ")}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{detail}</p>
        </div>
        <Icon size={18} className="text-lime-300" aria-hidden />
      </div>
    </Panel>
  );
}

function PlayerTile({ player, disabled = false, featured = false }: { player: PlayerCard; disabled?: boolean; featured?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 transition",
        disabled ? "border-zinc-800 bg-zinc-900/40 opacity-45" : "border-zinc-800 bg-zinc-900/80",
        featured ? "border-lime-300/50 bg-lime-300/10" : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-50">{player.name}</p>
          <p className="mt-1 text-xs text-zinc-500">{player.region}</p>
        </div>
        <Badge tone={player.position === "ATT" ? "red" : player.position === "MID" ? "amber" : player.position === "DEF" ? "blue" : "green"}>
          {player.position}
        </Badge>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
        <span>{player.baseStars}+{player.potentialStars} Stars</span>
        <span>{money(player.minimumBid)}</span>
      </div>
    </div>
  );
}

function OrderList({ clubIds, clubs, activeIndex }: { clubIds: string[]; clubs: Club[]; activeIndex: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {clubIds.map((clubId, index) => {
        const club = clubs.find((item) => item.id === clubId);
        return (
          <div
            key={`${clubId}-${index}`}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2",
              index === activeIndex ? "border-lime-300 bg-lime-300/10" : "border-zinc-800 bg-zinc-900/70",
            )}
          >
            <span className="font-mono text-xs text-zinc-500">{String(index + 1).padStart(2, "0")}</span>
            <span className="truncate text-sm text-zinc-100">{club?.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function PitchPanel({ club, lineup, demo }: { club: Club; lineup: Lineup; demo: DemoGame }) {
  const validation = validateFormation(lineup);
  const zones: TacticalZone[] = ["ATT", "MID", "DEF"];

  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>{club.name}</PanelTitle>
          <PanelDescription>{lineup.formation} - Captain {lineup.captainBoostZone}</PanelDescription>
        </div>
        <Badge tone={validation.ok ? "green" : "red"}>{validation.ok ? "locked" : "invalid"}</Badge>
      </PanelHeader>
      <div className="relative overflow-hidden rounded-md border border-emerald-900 bg-emerald-950 p-3">
        <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-700/60" />
        <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-700/60" />
        <div className="relative grid min-h-[340px] grid-rows-3 gap-3">
          {zones.map((zone) => (
            <div key={zone} className="grid grid-cols-5 gap-2 rounded-md border border-emerald-800/70 bg-emerald-900/35 p-2">
              {(zone === "DEF" ? [...lineup.starters.GK, ...lineup.starters.DEF] : lineup.starters[zone]).map((playerId) => {
                const player = demo.playerCatalog[playerId];
                return (
                  <div key={playerId} className="flex min-h-12 items-center justify-center rounded-md bg-zinc-950/75 px-2 text-center text-[11px] font-medium text-zinc-100">
                    {player.position} {player.baseStars}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
        {(["DEF", "MID", "ATT"] as const).map((zone) => (
          <span key={zone} className="rounded-md bg-zinc-900 px-2 py-1">
            {zone}: {FORMATION_COUNTS[lineup.formation][zone]}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function MatchTimeline({ demo, compact = false }: { demo: DemoGame; compact?: boolean }) {
  const clubs = Object.fromEntries(demo.clubs.map((club) => [club.id, club]));
  const thirds = compact ? demo.match.thirds.slice(0, 2) : demo.match.thirds;

  return (
    <div className="space-y-3">
      {thirds.map((third) => (
        <div key={third.index} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-100">Drittel {third.index}</p>
            <Badge tone={third.winnerClubId ? "green" : "neutral"}>{third.winnerClubId ? clubs[third.winnerClubId]?.name : "Remis"}</Badge>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[third.home, third.away].map((side) => (
              <div key={`${third.index}-${side.clubId}`} className="rounded-md bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-100">{clubs[side.clubId]?.name}</span>
                  <span className="font-mono text-lg text-lime-200">{side.total}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {side.zone}: {side.baseStars} + Chemie {side.chemistryBonus} + Boost {side.captainBoost} + Wuerfel {side.dice.join("+")}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!compact && demo.match.events.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {demo.match.events.map((event, index) => (
            <div key={`${event.type}-${index}`} className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
              {event.type === "injury"
                ? `${clubs[event.clubId]?.name}: Verletzung in Drittel ${event.thirdIndex}`
                : `${clubs[event.clubId]?.name}: Game Changer in Drittel ${event.thirdIndex}`}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
