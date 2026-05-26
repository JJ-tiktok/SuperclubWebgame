"use client";

import { AlertTriangle, Database, RotateCcw, Shuffle, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { calculateCardChemistryBonus, getTotalSkillValue, type PlayerCardData } from "@/types/player-card";
import { cn } from "@/lib/utils";

type DbDraftResult = { ok: true; players: PlayerCardData[] } | { ok: false; error: string };

type TestClub = {
  id: string;
  name: string;
  color: string;
};

type TestPick = {
  clubId: string;
  playerId: string;
  roundIndex: number;
  pickIndex: number;
};

const clubs: TestClub[] = [
  { id: "vanguard", name: "Vanguard FC", color: "#0f172a" },
  { id: "golden", name: "Golden Meadow", color: "#047857" },
  { id: "dynamo", name: "Dynamo Draft", color: "#d97706" },
  { id: "crimson", name: "Crimson Cape", color: "#be123c" },
];

export function DbDraftTestBoard({ result }: { result: DbDraftResult }) {
  const [maxStars, setMaxStars] = useState(5);
  const [seed, setSeed] = useState(1);
  const [picks, setPicks] = useState<TestPick[]>([]);
  const players = useMemo(() => (result.ok ? result.players : []), [result]);
  const roundIndex = Math.floor(picks.length / 16);
  const roundPickIndex = picks.length % 16;
  const pickOrder = useMemo(() => getPickOrder(clubs, roundIndex, 16), [roundIndex]);
  const currentClubId = pickOrder[roundPickIndex] ?? null;
  const currentClub = clubs.find((club) => club.id === currentClubId);
  const previousRoundPickedIds = useMemo(
    () => picks.filter((pick) => pick.roundIndex < roundIndex).map((pick) => pick.playerId),
    [picks, roundIndex],
  );
  const board = useMemo(
    () => createBoard(players, seed + roundIndex, maxStars, previousRoundPickedIds),
    [maxStars, players, previousRoundPickedIds, roundIndex, seed],
  );
  const pickedOnBoard = new Set(picks.filter((pick) => pick.roundIndex === roundIndex).map((pick) => pick.playerId));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const chemistryBonus = calculateCardChemistryBonus(board);

  function pickPlayer(playerId: string) {
    if (!currentClubId || pickedOnBoard.has(playerId)) {
      return;
    }

    setPicks((current) => [
      ...current,
      {
        clubId: currentClubId,
        playerId,
        roundIndex,
        pickIndex: roundPickIndex,
      },
    ]);
  }

  function resetDraft() {
    setPicks([]);
    setSeed((value) => value + 1);
  }

  return (
    <main className="min-h-screen bg-[#07100d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-lg border border-emerald-900/70 bg-zinc-950/90">
          <div className="h-1.5 bg-emerald-500" />
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">DB Draft Test</Badge>
                <Badge>{result.ok ? `${players.length} Spieler geladen` : "DB Fehler"}</Badge>
                <Badge>ohne Savegame</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Draft mit echten DB-Spielern</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Testet die echte Player Base, ohne Lobby, Clubbesitz oder Training in der Datenbank zu verändern.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[3, 4, 5, 6].map((stars) => (
                <Button
                  key={stars}
                  onClick={() => {
                    setMaxStars(stars);
                    setPicks([]);
                    setSeed((value) => value + 1);
                  }}
                  type="button"
                  variant={maxStars === stars ? "primary" : "outline"}
                >
                  max {stars}
                </Button>
              ))}
              <Button onClick={resetDraft} type="button" variant="secondary">
                <RotateCcw size={16} aria-hidden />
                Reset
              </Button>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                href="/player-db-test"
              >
                DB-Karten
              </Link>
            </div>
          </div>
        </header>

        {!result.ok ? <ErrorPanel message={result.error} /> : null}

        {result.ok && players.length < 16 ? (
          <Panel className="border-amber-900/70 bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Zu wenige Spieler</PanelTitle>
                <PanelDescription>
                  Fuer ein echtes 16er Board brauchst du mindestens 16 sichtbare Spieler mit `visibility = public` oder `room`.
                </PanelDescription>
              </div>
              <AlertTriangle size={18} className="text-amber-300" aria-hidden />
            </PanelHeader>
          </Panel>
        ) : null}

        {result.ok && players.length >= 16 ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <section className="space-y-4">
              <Panel className="border-emerald-900/70 bg-zinc-950/85">
                <PanelHeader>
                  <div>
                    <PanelTitle>Draft Board</PanelTitle>
                    <PanelDescription>
                      Runde {roundIndex + 1} - Pick {roundPickIndex + 1} von 16
                    </PanelDescription>
                  </div>
                  <Badge tone="green">{roundPickIndex}/16 Picks</Badge>
                </PanelHeader>

                <div className="grid gap-3 md:grid-cols-4">
                  <Metric icon={Users} label="Aktueller Club" value={currentClub?.name ?? "Runde fertig"} />
                  <Metric icon={Sparkles} label="Sternlimit" value={`max ${maxStars}`} />
                  <Metric icon={Shuffle} label="Chemistry Board" value={`+${chemistryBonus}`} />
                  <Metric icon={Database} label="Quelle" value="Supabase" />
                </div>
              </Panel>

              <div className="grid gap-x-7 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                {board.map((player, index) => {
                  const picked = pickedOnBoard.has(player.id);
                  const nextPlayer = board[index + 1];
                  const linkedToNext = Boolean(player.chemistry.right && nextPlayer?.chemistry.left);

                  return (
                    <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/80 p-2" key={player.id}>
                      <PlayerCard disabled={picked} player={player} variant="draft" />
                      {linkedToNext ? <ChemistryBridge /> : null}
                      <Button
                        className="mt-2 w-full"
                        disabled={picked || !currentClubId}
                        onClick={() => pickPlayer(player.id)}
                        type="button"
                        variant={picked ? "outline" : "primary"}
                      >
                        {picked ? "Gedraftet" : currentClub ? `${currentClub.name} pickt` : "Runde fertig"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="space-y-4">
              <Panel className="border-emerald-900/70 bg-zinc-950/85">
                <PanelHeader>
                  <div>
                    <PanelTitle>Manager</PanelTitle>
                    <PanelDescription>Rotierender Start pro Runde.</PanelDescription>
                  </div>
                  <Users size={18} className="text-emerald-300" aria-hidden />
                </PanelHeader>
                <div className="space-y-2">
                  {clubs.map((club) => {
                    const clubPicks = picks.filter((pick) => pick.clubId === club.id).length;
                    const clubStars = picks
                      .filter((pick) => pick.clubId === club.id)
                      .reduce((total, pick) => total + getTotalSkillValue(playerById.get(pick.playerId) ?? fallbackPlayer), 0);

                    return (
                      <div
                        className={cn(
                          "rounded-md border bg-zinc-900/70 p-3",
                          club.id === currentClubId ? "border-emerald-400" : "border-zinc-800",
                        )}
                        key={club.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: club.color }} />
                            <span className="truncate text-sm font-semibold text-zinc-100">{club.name}</span>
                          </span>
                          <Badge tone={club.id === currentClubId ? "green" : "neutral"}>{clubPicks}/16</Badge>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">{clubStars} Sterne gedraftet</p>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel className="border-emerald-900/70 bg-zinc-950/85">
                <PanelHeader>
                  <div>
                    <PanelTitle>Pick-Historie</PanelTitle>
                    <PanelDescription>Letzte Picks aus deiner Player Base.</PanelDescription>
                  </div>
                  <Shuffle size={18} className="text-emerald-300" aria-hidden />
                </PanelHeader>
                <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                  {picks.length === 0 ? (
                    <p className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-400">
                      Noch kein Pick.
                    </p>
                  ) : (
                    [...picks].reverse().map((pick) => {
                      const club = clubs.find((item) => item.id === pick.clubId);
                      const player = playerById.get(pick.playerId);

                      return (
                        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={`${pick.roundIndex}-${pick.pickIndex}`}>
                          <p className="text-xs font-medium uppercase text-zinc-500">
                            Runde {pick.roundIndex + 1} - Pick {pick.pickIndex + 1}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-zinc-100">{player?.name ?? "Spieler"}</p>
                          <p className="mt-1 text-xs text-zinc-500">{club?.name ?? "Club"}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </Panel>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Panel className="border-rose-900/70 bg-rose-950/30">
      <PanelHeader>
        <div>
          <PanelTitle>DB-Abruf fehlgeschlagen</PanelTitle>
          <PanelDescription>{message}</PanelDescription>
        </div>
        <Database size={18} className="text-rose-300" aria-hidden />
      </PanelHeader>
    </Panel>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-lg font-semibold text-zinc-50">{value}</p>
        </div>
        <Icon size={16} className="text-emerald-300" aria-hidden />
      </div>
    </div>
  );
}

function ChemistryBridge() {
  return (
    <div
      className="pointer-events-none absolute right-[-22px] top-[64px] z-30 hidden h-7 w-11 items-center justify-center sm:flex"
      aria-hidden
    >
      <span className="h-0.5 flex-1 bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.85)]" />
      <span className="mx-[-1px] h-3 w-3 rounded-full border border-yellow-100 bg-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.95)]" />
      <span className="h-0.5 flex-1 bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.85)]" />
    </div>
  );
}

function getPickOrder(clubList: TestClub[], roundIndex: number, boardSize: number) {
  const rotated = clubList.map((_, index) => clubList[(index + roundIndex) % clubList.length].id);
  const order: string[] = [];

  for (let index = 0; index < boardSize; index += 1) {
    order.push(rotated[index % rotated.length]);
  }

  return order;
}

function createBoard(players: PlayerCardData[], seed: number, maxStars: number, pickedPlayerIds: string[]) {
  const usedIds = new Set(pickedPlayerIds);
  const available = players.filter((player) => getTotalSkillValue(player) <= maxStars && !usedIds.has(player.id));
  const shuffled = seededShuffle(available, seed);

  return shuffled.slice(0, 16);
}

function seededShuffle<T>(items: T[], seed: number) {
  const copy = [...items];
  let state = seed * 9301 + 49297;

  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const swapIndex = Math.floor((state / 233280) * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

const fallbackPlayer: PlayerCardData = {
  ageGroup: "prime",
  cardStyle: { tier: "standard" },
  chemistry: { left: false, right: false, symbol: "star" },
  id: "fallback",
  market: { currency: "M", scoutingFee: 0, transferFee: 0 },
  name: "Fallback",
  position: "MID",
  positions: ["MID"],
  skill: { current: 0, max: 0, potential: 0, veteranFallback: null },
};
