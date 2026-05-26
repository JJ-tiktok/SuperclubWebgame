"use client";

import type { PointerEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { cn } from "@/lib/utils";
import { MINIMUM_FORMATION_COUNTS, type PlayerCardData, type PlayerCardPosition } from "@/types/player-card";

type FormationSlot = {
  id: string;
  label: string;
  required: boolean;
  zone: PlayerCardPosition;
  x: number;
  y: number;
};

type DragState = {
  fromSlotId: string;
  offsetX: number;
  offsetY: number;
  playerId: string;
  pointerId: number;
  x: number;
  y: number;
};

const minimumSlots: FormationSlot[] = [
  { id: "att-left", label: "ATT", required: true, zone: "ATT", x: 38, y: 18 },
  { id: "att-right", label: "ATT", required: true, zone: "ATT", x: 62, y: 18 },
  { id: "mid-left", label: "MID", required: true, zone: "MID", x: 28, y: 46 },
  { id: "mid-center", label: "MID", required: true, zone: "MID", x: 50, y: 46 },
  { id: "mid-right", label: "MID", required: true, zone: "MID", x: 72, y: 46 },
  { id: "def-left", label: "DEF", required: true, zone: "DEF", x: 28, y: 74 },
  { id: "def-center", label: "DEF", required: true, zone: "DEF", x: 50, y: 74 },
  { id: "def-right", label: "DEF", required: true, zone: "DEF", x: 72, y: 74 },
];

const supportSlots: FormationSlot[] = [
  { id: "gk", label: "GK", required: false, zone: "GK", x: 50, y: 91 },
  { id: "flex-att", label: "+ATT", required: false, zone: "ATT", x: 84, y: 18 },
  { id: "flex-mid", label: "+MID", required: false, zone: "MID", x: 84, y: 46 },
  { id: "flex-def", label: "+DEF", required: false, zone: "DEF", x: 84, y: 74 },
];

const formationSlots = [...minimumSlots, ...supportSlots];

const initialAssignments: Record<string, string> = {
  "att-left": "player_006",
  "att-right": "player_010",
  "def-center": "player_002",
  "def-left": "player_008",
  "def-right": "player_003",
  gk: "player_001",
  "mid-center": "player_004",
  "mid-left": "player_009",
  "mid-right": "player_005",
};

export function PlayerCardsDemo({ players }: { players: PlayerCardData[] }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [drag, setDrag] = useState<DragState | null>(null);
  const counts = getFormationCounts(assignments, playerById);
  const validBase =
    counts.DEF >= MINIMUM_FORMATION_COUNTS.DEF &&
    counts.MID >= MINIMUM_FORMATION_COUNTS.MID &&
    counts.ATT >= MINIMUM_FORMATION_COUNTS.ATT;
  const slotById = new Map(formationSlots.map((slot) => [slot.id, slot]));

  function startDrag(event: PointerEvent<HTMLDivElement>, fromSlotId: string, playerId: string) {
    const board = boardRef.current;
    const slot = slotById.get(fromSlotId);
    if (!board || !slot) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      fromSlotId,
      offsetX: pointerX - slot.x,
      offsetY: pointerY - slot.y,
      playerId,
      pointerId: event.pointerId,
      x: slot.x,
      y: slot.y,
    });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const board = boardRef.current;
    if (!board || drag?.pointerId !== event.pointerId) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    setDrag((current) =>
      current
        ? {
            ...current,
            x: clamp(pointerX - current.offsetX, 9, 91),
            y: clamp(pointerY - current.offsetY, 10, 91),
          }
        : null,
    );
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const targetSlot = getNearestSlot(drag.x, drag.y);
    const player = playerById.get(drag.playerId);

    if (targetSlot && player && canUseSlot(player, targetSlot)) {
      setAssignments((current) => {
        const fromSlot = slotById.get(drag.fromSlotId);
        const next = { ...current };
        const displacedPlayerId = next[targetSlot.id];
        const displacedPlayer = displacedPlayerId ? playerById.get(displacedPlayerId) : undefined;

        if (fromSlot && displacedPlayer && !canUseSlot(displacedPlayer, fromSlot)) {
          return current;
        }

        next[targetSlot.id] = drag.playerId;
        if (targetSlot.id !== drag.fromSlotId) {
          if (displacedPlayerId) {
            next[drag.fromSlotId] = displacedPlayerId;
          } else {
            delete next[drag.fromSlotId];
          }
        }
        return next;
      });
    }

    setDrag(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 xl:grid-cols-[500px_1fr]">
      <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Aufstellung Preview</h1>
            <p className="mt-1 text-sm text-sky-200">Slots: min. 3 DEF, 3 MID, 2 ATT</p>
          </div>
          <span className={cn("rounded-md border px-3 py-1 text-xs font-semibold", validBase ? "border-emerald-600 bg-emerald-950 text-emerald-200" : "border-amber-600 bg-amber-950 text-amber-200")}>
            {validBase ? "valid" : "incomplete"}
          </span>
        </div>

        <div
          className="relative h-[460px] overflow-hidden rounded-md border border-emerald-700 bg-emerald-950/70 touch-none"
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          ref={boardRef}
        >
          <PitchBand top="7%" height="24%" label="Angriff" />
          <PitchBand top="35%" height="24%" label="Mittelfeld" />
          <PitchBand top="63%" height="24%" label="Abwehr" />

          {formationSlots.map((slot) => {
            const playerId = assignments[slot.id];
            const player = playerId ? playerById.get(playerId) : undefined;
            const isDragged = drag?.fromSlotId === slot.id;

            return (
              <div
                className={cn(
                  "absolute h-[92px] w-[72px] rounded-md border border-dashed bg-black/20 p-1",
                  slot.required ? "border-emerald-500/70" : "border-zinc-600/70",
                  !player ? "flex items-center justify-center text-[10px] font-black text-zinc-500" : "",
                )}
                key={slot.id}
                style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: "translate(-50%, -50%)" }}
              >
                {player && !isDragged ? (
                  <div className="cursor-grab active:cursor-grabbing" onPointerDown={(event) => startDrag(event, slot.id, player.id)}>
                    <PlayerCard player={player} variant="lineup" />
                  </div>
                ) : (
                  <span>{slot.label}</span>
                )}
              </div>
            );
          })}

          {drag ? (
            <DraggedCard drag={drag} player={playerById.get(drag.playerId)} />
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-400">
          <Requirement label="DEF" met={counts.DEF >= MINIMUM_FORMATION_COUNTS.DEF} value={`${counts.DEF}/${MINIMUM_FORMATION_COUNTS.DEF}`} />
          <Requirement label="MID" met={counts.MID >= MINIMUM_FORMATION_COUNTS.MID} value={`${counts.MID}/${MINIMUM_FORMATION_COUNTS.MID}`} />
          <Requirement label="ATT" met={counts.ATT >= MINIMUM_FORMATION_COUNTS.ATT} value={`${counts.ATT}/${MINIMUM_FORMATION_COUNTS.ATT}`} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Draft Board</h2>
            <p className="mt-1 text-sm text-zinc-400">Kompakte Karten mit Chemistry-Halbsternen</p>
          </div>
          <span className="rounded-md border border-emerald-600 bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-200">3/16 Picks</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {players.concat(players.slice(0, 5)).map((player, index) => (
            <PlayerCard disabled={index < 3} key={`${player.id}-${index}`} player={player} selected={index === 4} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DraggedCard({ drag, player }: { drag: DragState; player: PlayerCardData | undefined }) {
  if (!player) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute z-30 w-[72px] scale-105 opacity-95 shadow-2xl"
      style={{ left: `${drag.x}%`, top: `${drag.y}%`, transform: "translate(-50%, -50%)" }}
    >
      <PlayerCard player={player} variant="lineup" />
    </div>
  );
}

function PitchBand({ height, label, top }: { height: string; label: string; top: string }) {
  return (
    <div className="absolute inset-x-5 rounded-md border border-emerald-700 bg-emerald-900/35" style={{ top, height }}>
      <span className="absolute left-2 top-2 text-[10px] font-semibold uppercase text-emerald-200/50">{label}</span>
    </div>
  );
}

function Requirement({ label, met, value }: { label: string; met: boolean; value: string }) {
  return (
    <div className={cn("rounded px-2 py-1", met ? "bg-emerald-950 text-emerald-200" : "bg-zinc-900 text-zinc-400")}>
      {label}: {value}
    </div>
  );
}

function getNearestSlot(x: number, y: number) {
  const nearest = formationSlots
    .map((slot) => ({ distance: Math.hypot(slot.x - x, slot.y - y), slot }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest && nearest.distance <= 13 ? nearest.slot : null;
}

function getFormationCounts(assignments: Record<string, string>, playerById: Map<string, PlayerCardData>) {
  return formationSlots.reduce(
    (counts, slot) => {
      const player = playerById.get(assignments[slot.id] ?? "");
      if (player && canUseSlot(player, slot)) {
        counts[slot.zone] += 1;
      }
      return counts;
    },
    { ATT: 0, DEF: 0, GK: 0, MID: 0 } satisfies Record<PlayerCardPosition, number>,
  );
}

function canUseSlot(player: PlayerCardData, slot: FormationSlot) {
  return player.positions.includes(slot.zone);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
