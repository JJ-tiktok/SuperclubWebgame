"use client";

import { RotateCcw, Shuffle, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { PlayerCardData, PlayerCardPosition } from "@/types/player-card";
import { cn } from "@/lib/utils";

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

const positions: Array<{ position: PlayerCardPosition; eligible: PlayerCardPosition[]; label: string }> = [
  { position: "GK", eligible: ["GK"], label: "Keeper" },
  { position: "DEF", eligible: ["DEF"], label: "Defender" },
  { position: "DEF", eligible: ["DEF", "MID"], label: "Hybrid Defender" },
  { position: "MID", eligible: ["MID"], label: "Midfielder" },
  { position: "MID", eligible: ["MID", "ATT"], label: "Advanced Mid" },
  { position: "ATT", eligible: ["ATT"], label: "Forward" },
  { position: "MID", eligible: ["GK", "DEF", "MID", "ATT"], label: "Utility" },
];

const names = [
  "Jonas Kern",
  "Marco Stein",
  "Luca Brandt",
  "Noah Weber",
  "Elias Cruz",
  "Samuel Green",
  "Alex Nova",
  "Viktor Holm",
  "Milan Costa",
  "Ren Ito",
  "Theo Mason",
  "David Park",
  "Oscar Lima",
  "Aron Keller",
  "Mateo Silva",
  "Niko Voss",
  "Ivan Novak",
  "Yuri Sato",
  "Timo Falk",
  "Leo Bender",
  "Dario Klein",
  "Kian Wolf",
  "Rafael Soto",
  "Ben Adler",
  "Mats Winter",
  "Emil Rocha",
  "Luis Berger",
  "Kai Moreno",
  "Anton Vale",
  "Finn Ortega",
  "Jan Santos",
  "Ruben Meyer",
];

const playerPool = createPlayerPool();

export function DraftTestBoard() {
  const [maxStars, setMaxStars] = useState(5);
  const [seed, setSeed] = useState(1);
  const [picks, setPicks] = useState<TestPick[]>([]);
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
    () => createBoard(seed + roundIndex, maxStars, previousRoundPickedIds),
    [maxStars, previousRoundPickedIds, roundIndex, seed],
  );
  const pickedOnBoard = new Set(picks.filter((pick) => pick.roundIndex === roundIndex).map((pick) => pick.playerId));
  const playerById = new Map(playerPool.map((player) => [player.id, player]));

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
    <main className="min-h-screen bg-[#06110d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-lg border border-emerald-900/70 bg-zinc-950/90">
          <div className="h-1.5 bg-emerald-500" />
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">Draft Test</Badge>
                <Badge>ohne Lobby</Badge>
                <Badge>{picks.length} Picks gesamt</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-zinc-50">16er Draftboard</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Testet Board-Generierung, rotierende Pick-Reihenfolge und kompakte Spielerkarten.
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
            </div>
          </div>
        </header>

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

              <div className="grid gap-3 md:grid-cols-3">
                <Metric icon={Users} label="Aktueller Club" value={currentClub?.name ?? "Runde fertig"} />
                <Metric icon={Sparkles} label="Sternlimit" value={`max ${maxStars}`} />
                <Metric icon={Shuffle} label="Pickmodus" value="rotierend" />
              </div>
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {board.map((player) => {
                const picked = pickedOnBoard.has(player.id);

                return (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2" key={player.id}>
                    <PlayerCard disabled={picked} player={player} variant="draft" />
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
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel className="border-emerald-900/70 bg-zinc-950/85">
              <PanelHeader>
                <div>
                  <PanelTitle>Pick-Historie</PanelTitle>
                  <PanelDescription>Letzte Picks im Testdraft.</PanelDescription>
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
      </div>
    </main>
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

function getPickOrder(clubList: TestClub[], roundIndex: number, boardSize: number) {
  const rotated = clubList.map((_, index) => clubList[(index + roundIndex) % clubList.length].id);
  const order: string[] = [];

  for (let index = 0; index < boardSize; index += 1) {
    order.push(rotated[index % rotated.length]);
  }

  return order;
}

function createBoard(seed: number, maxStars: number, pickedPlayerIds: string[]) {
  const usedIds = new Set(pickedPlayerIds);
  const available = playerPool.filter((player) => player.skill.current <= maxStars && !usedIds.has(player.id));
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

function createPlayerPool(): PlayerCardData[] {
  return names.map((name, index) => {
    const position = positions[index % positions.length];
    const current = 1 + (index % 6);
    const potentialBonus = index % 3;
    const ageGroup = index % 9 === 0 ? "veteran" : index % 4 === 0 ? "talent" : "prime";

    return {
      id: `test_player_${String(index + 1).padStart(3, "0")}`,
      name,
      position: position.position,
      positions: position.eligible,
      role: position.label,
      nationality: ["GER", "BRA", "DEN", "USA", "JPN", "ARG"][index % 6],
      age: ageGroup === "veteran" ? 34 + (index % 4) : ageGroup === "talent" ? 18 + (index % 5) : 24 + (index % 6),
      ageGroup,
      skill: {
        current,
        potential: Math.min(6, current + potentialBonus),
        max: 6,
        veteranFallback: ageGroup === "veteran" ? Math.max(1, current - 2) : null,
      },
      chemistry: {
        left: index % 3 === 0,
        right: index % 3 === 1,
        symbol: "star",
      },
      market: {
        transferFee: 10 + current * 8 + (index % 4) * 2,
        scoutingFee: 3 + current * 2,
        currency: "M",
      },
      cardStyle: {
        tier: ageGroup === "veteran" ? "veteran" : "standard",
      },
    };
  });
}
