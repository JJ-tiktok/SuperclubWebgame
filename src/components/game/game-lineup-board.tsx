"use client";

import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveLineupAction } from "@/app/games/actions/match";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArchetypeMatchupGuide } from "@/components/game/shared/archetype-matchup-guide";
import {
  ensureDefaultKeeper,
  ensureGoalkeeperAssigned,
  getFormationCounts,
  isLineupPlayerActive,
  isLineupPlayerAssignable,
  isLineupPlayerBlocked,
  rebuildLineupAssignments,
  stripUnavailableAssignments,
  type FormationSlot,
  type LineupAssignmentCard,
} from "@/lib/lobby/lineup-assignments";
import { applyPositionPenalty, getPositionPenalty } from "@/lib/lobby/position-penalty";
import { getTotalSkillValue, type PlayerCardPosition } from "@/types/player-card";

type LineupCard = LineupAssignmentCard;

type FormationKey = "3-4-3" | "4-4-2" | "4-3-3" | "3-5-2" | "5-3-2";

type DragState = {
  fromSlotId: string;
  offsetX: number;
  offsetY: number;
  playerId: string;
  pointerId: number;
  x: number;
  y: number;
};

type ChemistryLink = {
  leftSlotId: string;
  rightSlotId: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  zone: "ATT" | "DEF" | "MID";
};

type LineupPayloadItem = {
  club_player_id: string;
  slot: number;
  zone: PlayerCardPosition;
};

const formations: Array<{ id: FormationKey; label: string }> = [
  { id: "3-4-3", label: "3-4-3" },
  { id: "4-4-2", label: "4-4-2" },
  { id: "4-3-3", label: "4-3-3" },
  { id: "3-5-2", label: "3-5-2" },
  { id: "5-3-2", label: "5-3-2" },
];

const formationLayouts: Record<FormationKey, FormationSlot[]> = {
  "3-4-3": [
    ...rowSlots("ATT", 3, 16),
    ...rowSlots("MID", 4, 44),
    ...rowSlots("DEF", 3, 72),
    { id: "gk", label: "GK", required: true, zone: "GK", x: 50, y: 89 },
  ],
  "4-4-2": [
    ...rowSlots("ATT", 2, 16),
    ...rowSlots("MID", 4, 44),
    ...rowSlots("DEF", 4, 72),
    { id: "gk", label: "GK", required: true, zone: "GK", x: 50, y: 89 },
  ],
  "4-3-3": [
    ...rowSlots("ATT", 3, 16),
    ...rowSlots("MID", 3, 44),
    ...rowSlots("DEF", 4, 72),
    { id: "gk", label: "GK", required: true, zone: "GK", x: 50, y: 89 },
  ],
  "3-5-2": [
    ...rowSlots("ATT", 2, 16),
    ...rowSlots("MID", 5, 44),
    ...rowSlots("DEF", 3, 72),
    { id: "gk", label: "GK", required: true, zone: "GK", x: 50, y: 89 },
  ],
  "5-3-2": [
    ...rowSlots("ATT", 2, 16),
    ...rowSlots("MID", 3, 44),
    ...rowSlots("DEF", 5, 72),
    { id: "gk", label: "GK", required: true, zone: "GK", x: 50, y: 89 },
  ],
};

type StaffZoneEffect = { type: string; zone?: string; stars?: number; factor?: number };

export function GameLineupBoard({
  archetypesEnabled = true,
  cards,
  gameId,
  roomCode,
  staffEffects = [],
  captainId = null,
  captainBoost = 0,
  saveBlocked = false,
  saveBlockedReason,
}: {
  archetypesEnabled?: boolean;
  cards: LineupCard[];
  gameId: string;
  roomCode: string;
  staffEffects?: StaffZoneEffect[];
  captainId?: string | null;
  captainBoost?: number;
  saveBlocked?: boolean;
  saveBlockedReason?: string;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cardsWithDefaultKeeper = useMemo(() => ensureDefaultKeeper(cards), [cards]);
  const cardById = useMemo(() => new Map(cardsWithDefaultKeeper.map((card) => [card.id, card])), [cardsWithDefaultKeeper]);
  const hasSavedLineup = useMemo(() => cardsWithDefaultKeeper.some((card) => isSavedLineupZone(card.sourceZone)), [cardsWithDefaultKeeper]);
  const [selectedFormation, setSelectedFormation] = useState<FormationKey>(() =>
    resolveInitialFormation(cardsWithDefaultKeeper, roomCode),
  );
  const formationSlots = useMemo(() => formationLayouts[selectedFormation], [selectedFormation]);
  const requiredCounts = useMemo(() => getRequiredCounts(formationSlots), [formationSlots]);
  const [assignments, setAssignments] = useState(() => {
    const formation = resolveInitialFormation(cardsWithDefaultKeeper, roomCode);
    return rebuildLineupAssignments(cardsWithDefaultKeeper, formationLayouts[formation], !hasSavedLineup);
  });
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    writeStoredFormation(roomCode, selectedFormation);
  }, [roomCode, selectedFormation]);

  useEffect(() => {
    const pool = ensureDefaultKeeper(cards);
    const byId = new Map(pool.map((card) => [card.id, card]));
    setAssignments((current) => {
      const stripped = stripUnavailableAssignments(current, byId);
      return ensureGoalkeeperAssigned(stripped, pool, formationSlots);
    });
  }, [cards, formationSlots]);
  const assignedIds = new Set(Object.values(assignments));
  const benchCards = cardsWithDefaultKeeper.filter((card) => !assignedIds.has(card.id) && !card.lockedDefault);
  const chemistryLinks = getChemistryLinks(assignments, cardById, formationSlots);
  const summary = getLineupSummary(assignments, cardById, chemistryLinks, formationSlots, staffEffects, {
    captainId,
    captainBoost,
  });
  const chemistryMultiplier = (staffEffects ?? [])
    .filter((e) => e.type === "chemistry_multiplier")
    .reduce((best, e) => Math.max(best, e.factor ?? 1), 1);
  const counts = getFormationCounts(assignments, cardById, formationSlots);
  const lineupPayload = useMemo(() => getLineupPayload(assignments, cardById, formationSlots), [assignments, cardById, formationSlots]);
  const validBase =
    counts.DEF === requiredCounts.DEF &&
    counts.MID === requiredCounts.MID &&
    counts.ATT === requiredCounts.ATT &&
    counts.GK === requiredCounts.GK;
  const slotById = new Map(formationSlots.map((slot) => [slot.id, slot]));

  function changeFormation(nextFormation: FormationKey) {
    if (saveBlocked) {
      return;
    }

    const nextSlots = formationLayouts[nextFormation];
    const pool = ensureDefaultKeeper(cards);
    const byId = new Map(pool.map((card) => [card.id, card]));
    const stripped = stripUnavailableAssignments(assignments, byId);
    const assignedCards = Object.values(stripped).flatMap((playerId) => byId.get(playerId) ?? []);
    const assignedSet = new Set(assignedCards.map((card) => card.id));
    const remainingCards = pool.filter((card) => !assignedSet.has(card.id));

    setSelectedFormation(nextFormation);
    setAssignments(rebuildLineupAssignments([...assignedCards, ...remainingCards], nextSlots, true));
    setDrag(null);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>, fromSlotId: string, playerId: string) {
    if (saveBlocked) {
      return;
    }

    const board = boardRef.current;
    const slot = slotById.get(fromSlotId);
    const player = cardById.get(playerId);
    if (!board || !slot || isLineupPlayerBlocked(player)) {
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

  function startBenchDrag(event: PointerEvent<HTMLDivElement>, playerId: string) {
    if (saveBlocked) {
      return;
    }

    const board = boardRef.current;
    const player = cardById.get(playerId);
    if (!board || isLineupPlayerBlocked(player)) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      fromSlotId: `bench:${playerId}`,
      offsetX: 0,
      offsetY: 0,
      playerId,
      pointerId: event.pointerId,
      x: clamp(pointerX, 8, 92),
      y: clamp(pointerY, 10, 92),
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
        x: clamp(pointerX - current.offsetX, 4, 96),
        y: clamp(pointerY - current.offsetY, 5, 96),
          }
        : null,
    );
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const targetSlot = getNearestSlot(drag.x, drag.y, formationSlots);
    const player = cardById.get(drag.playerId);

    if (targetSlot && player && canPlacePlayer(player)) {
      setAssignments((current) => {
        const fromSlot = slotById.get(drag.fromSlotId);
        const next = { ...current };
        const displacedPlayerId = next[targetSlot.id];
        const displacedPlayer = displacedPlayerId ? cardById.get(displacedPlayerId) : undefined;

        if (displacedPlayer?.lockedDefault) {
          return current;
        }

        if (fromSlot && displacedPlayer && !canPlacePlayer(displacedPlayer)) {
          return current;
        }

        next[targetSlot.id] = drag.playerId;
        if (targetSlot.id !== drag.fromSlotId) {
          if (displacedPlayerId) {
            if (fromSlot) {
              next[drag.fromSlotId] = displacedPlayerId;
            }
          } else {
            delete next[drag.fromSlotId];
          }
        }
        return next;
      });
    } else if (slotById.has(drag.fromSlotId)) {
      setAssignments((current) => {
        const next = { ...current };
        delete next[drag.fromSlotId];
        return next;
      });
    }

    setDrag(null);
  }

  return (
    <div className="space-y-4" onPointerMove={moveDrag} onPointerUp={finishDrag}>
      <section className="rounded-lg border border-[var(--club-border)] bg-zinc-950/85 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryMetric label="Gesamt" value={summary.total} detail={`${summary.players}/11 Spieler`} />
          {(["DEF", "MID", "ATT"] as const).map((zone) => {
            const label = zone === "DEF" ? "Abwehr" : zone === "MID" ? "Mittelfeld" : "Angriff";
            const z = summary[zone];
            const rawLinks = chemistryLinks.filter((l) => l.zone === zone).length;
            const parts: string[] = [`${z.base} Basis`];
            if (rawLinks > 0) {
              parts.push(chemistryMultiplier > 1 ? `${z.chemistry} Link (${rawLinks}×${chemistryMultiplier})` : `${z.chemistry} Link`);
            }
            if (z.staffBonus > 0) parts.push(`+${z.staffBonus}★ Mitarbeiter`);
            return <SummaryMetric key={zone} label={label} value={z.total} detail={parts.join(" + ")} />;
          })}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--club-border)] bg-zinc-950/85 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-50">Aufstellung</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {saveBlocked
                ? "Bearbeitung gesperrt – Karteneffekt blockiert Aenderungen bis zum naechsten Spiel."
                : "Waehle eine Formation und besetze maximal elf Slots."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone={validBase ? "green" : "amber"}>{validBase ? "spielbereit" : "unvollstaendig"}</Badge>
            <form action={saveLineupAction}>
              <input name="game_id" type="hidden" value={gameId} />
              <input name="room_code" type="hidden" value={roomCode} />
              <input name="lineup_payload" type="hidden" value={JSON.stringify(lineupPayload)} />
              <Button
                disabled={!validBase || saveBlocked}
                size="sm"
                title={
                  saveBlocked
                    ? saveBlockedReason ?? "Aufstellung kann nicht gespeichert werden"
                    : validBase
                      ? "Aktuelle Aufstellung speichern"
                      : "Besetze alle Slots der Formation"
                }
                type="submit"
              >
                Aufstellung speichern
              </Button>
            </form>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {formations.map((formation) => (
            <button
              className={cn(
                "h-9 rounded-md border px-3 text-sm font-semibold transition",
                selectedFormation === formation.id
                  ? "border-[var(--club-color)] bg-[var(--club-color)] text-white"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                saveBlocked ? "cursor-not-allowed opacity-50 hover:bg-zinc-900" : "",
              )}
              disabled={saveBlocked}
              key={formation.id}
              onClick={() => changeFormation(formation.id)}
              type="button"
            >
              {formation.label}
            </button>
          ))}
        </div>

        <div className={cn(saveBlocked ? "pointer-events-none opacity-70" : "")}>
        {archetypesEnabled ? <ArchetypeMatchupGuide className="mb-4" /> : null}

        <div
          className="relative h-[580px] touch-none overflow-hidden rounded-md border border-emerald-800 bg-emerald-950/70"
          ref={boardRef}
        >
          <PitchMarkings />
          <PitchBand height="23%" label="Angriff" top="5%" />
          <PitchBand height="23%" label="Mittelfeld" top="33%" />
          <PitchBand height="23%" label="Abwehr" top="61%" />

          {chemistryLinks.map((link) => (
            <ChemistryConnection key={`${link.leftSlotId}-${link.rightSlotId}`} link={link} />
          ))}

          {formationSlots.map((slot) => {
            const playerId = assignments[slot.id];
            const player = playerId ? cardById.get(playerId) : undefined;
            const isDragged = drag?.fromSlotId === slot.id;
            const offPosPenalty = player && !isLineupPlayerBlocked(player)
              ? getPositionPenalty(player.positions.length ? player.positions : ["MID"], slot.zone)
              : 0;
            const isOffPosition = isFinite(offPosPenalty) ? offPosPenalty > 0 : true;

            return (
              <div
                className={cn(
                  "absolute h-[112px] w-[92px] rounded-md border border-dashed bg-black/20 p-1",
                  player && isOffPosition ? "border-rose-500/80" : slot.required ? "border-emerald-400/75" : "border-zinc-600/70",
                  !player ? "flex items-center justify-center text-[10px] font-black text-zinc-500" : "",
                )}
                key={slot.id}
                style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: "translate(-50%, -50%)" }}
              >
                {player && !isDragged ? (
                  <div
                    className={cn("relative", isLineupPlayerBlocked(player) ? "cursor-default" : "cursor-grab active:cursor-grabbing")}
                    onPointerDown={(event) => startDrag(event, slot.id, player.id)}
                  >
                    {captainId && player.id === captainId ? (
                      <span
                        className="absolute -left-1 -top-1 z-10 flex h-5 items-center gap-0.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-black shadow"
                        title={captainBoost > 0 ? `Captain (+${captainBoost})` : "Captain"}
                      >
                        C{captainBoost > 0 ? ` +${captainBoost}` : ""}
                      </span>
                    ) : null}
                    <LineupPlayerCard
                      offPosPenalty={isOffPosition ? offPosPenalty : 0}
                      player={player}
                      selected={player.lockedDefault}
                      showArchetypes={archetypesEnabled}
                      variant="lineup"
                    />
                  </div>
                ) : (
                  <span>{slot.label}</span>
                )}
              </div>
            );
          })}

          {drag ? <DraggedCard drag={drag} player={cardById.get(drag.playerId)} showArchetypes={archetypesEnabled} /> : null}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
          <Requirement label="GK" met={counts.GK >= 1} value={`${counts.GK}/1`} />
          <Requirement label="DEF" met={counts.DEF === requiredCounts.DEF} value={`${counts.DEF}/${requiredCounts.DEF}`} />
          <Requirement label="MID" met={counts.MID === requiredCounts.MID} value={`${counts.MID}/${requiredCounts.MID}`} />
          <Requirement label="ATT" met={counts.ATT === requiredCounts.ATT} value={`${counts.ATT}/${requiredCounts.ATT}`} />
        </div>
        </div>
      </section>

      <section className={cn("rounded-lg border border-[var(--club-border)] bg-zinc-950/85 p-4", saveBlocked ? "opacity-70" : "")}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-50">Bank</h2>
          <p className="mt-1 text-sm text-zinc-400">Nicht aufgestellte Spieler bleiben hier fuer spaetere Wechsel.</p>
        </div>
        {benchCards.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-700 bg-zinc-900/70 p-4 text-sm text-zinc-400">
            Ziehe Feldspieler aus der Aufstellung hierher oder neben einen Slot, um sie auf die Bank zu setzen.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {benchCards.map((player) => (
              <div
                className={cn(
                  "touch-none",
                  saveBlocked || isLineupPlayerBlocked(player) ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
                )}
                key={player.id}
                onPointerDown={(event) => startBenchDrag(event, player.id)}
              >
                <LineupPlayerCard player={player} showArchetypes={archetypesEnabled} variant="draft" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryMetric({ detail, label, value }: { detail: string; label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-zinc-50">{formatNumber(value)}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function rowSlots(zone: "ATT" | "DEF" | "MID", count: number, y: number): FormationSlot[] {
  const xByCount: Record<number, number[]> = {
    2: [38, 62],
    3: [26, 50, 74],
    4: [18, 40, 60, 82],
    5: [12, 31, 50, 69, 88],
  };

  return (xByCount[count] ?? []).map((x, index) => ({
    id: `${zone.toLowerCase()}-${index + 1}`,
    label: zone,
    required: true,
    x,
    y,
    zone,
  }));
}

function getRequiredCounts(slots: FormationSlot[]) {
  return slots.reduce(
    (counts, slot) => {
      counts[slot.zone] += 1;
      return counts;
    },
    { ATT: 0, DEF: 0, GK: 0, MID: 0 } satisfies Record<PlayerCardPosition, number>,
  );
}

function getFormationStorageKey(roomCode: string) {
  return `superclub-lineup-formation:${roomCode}`;
}

function isFormationKey(value: string | null | undefined): value is FormationKey {
  return value != null && value in formationLayouts;
}

function readStoredFormation(roomCode: string): FormationKey | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(getFormationStorageKey(roomCode));
  return isFormationKey(value) ? value : null;
}

function writeStoredFormation(roomCode: string, formation: FormationKey) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getFormationStorageKey(roomCode), formation);
}

function resolveInitialFormation(cards: LineupCard[], roomCode: string): FormationKey {
  return inferSavedFormation(cards) ?? readStoredFormation(roomCode) ?? "4-4-2";
}

function inferSavedFormation(cards: LineupCard[]): FormationKey | null {
  const counts = cards.reduce(
    (total, card) => {
      const zone = normalizeZone(card.sourceZone);
      if (zone === "ATT" || zone === "DEF" || zone === "MID") {
        total[zone] += 1;
      }

      return total;
    },
    { ATT: 0, DEF: 0, MID: 0 } satisfies Record<"ATT" | "DEF" | "MID", number>,
  );
  const match = formations.find((formation) => {
    const required = getRequiredCounts(formationLayouts[formation.id]);
    return required.ATT === counts.ATT && required.DEF === counts.DEF && required.MID === counts.MID;
  });

  return match?.id ?? null;
}

function ChemistryConnection({ link }: { link: ChemistryLink }) {
  const centerX = (link.x1 + link.x2) / 2;
  const centerY = (link.y1 + link.y2) / 2;
  const width = Math.hypot(link.x2 - link.x1, link.y2 - link.y1);
  const angle = Math.atan2(link.y2 - link.y1, link.x2 - link.x1) * (180 / Math.PI);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20 h-1 rounded-full bg-yellow-300 shadow-[0_0_16px_rgba(253,224,71,0.85)]"
      style={{
        left: `${centerX}%`,
        top: `${centerY}%`,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        width: `${width}%`,
      }}
    >
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-100 bg-yellow-300 shadow-[0_0_14px_rgba(253,224,71,0.95)]" />
    </div>
  );
}

function PitchMarkings() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-emerald-300/20" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/20" />
      <div className="pointer-events-none absolute inset-x-[24%] bottom-2 h-16 rounded-t-md border border-emerald-300/20" />
      <div className="pointer-events-none absolute inset-x-[30%] top-2 h-12 rounded-b-md border border-emerald-300/15" />
    </>
  );
}

function getChemistryLinks(assignments: Record<string, string>, cardById: Map<string, LineupCard>, formationSlots: FormationSlot[]) {
  const links: ChemistryLink[] = [];

  for (const zone of ["ATT", "MID", "DEF"] as const) {
    const zoneSlots = formationSlots
      .filter((slot) => slot.zone === zone)
      .sort((a, b) => a.x - b.x);

    for (let index = 0; index < zoneSlots.length - 1; index += 1) {
      const leftSlot = zoneSlots[index];
      const rightSlot = zoneSlots[index + 1];
      const leftCard = cardById.get(assignments[leftSlot.id] ?? "");
      const rightCard = cardById.get(assignments[rightSlot.id] ?? "");

      if (leftCard?.chemistry.right && rightCard?.chemistry.left) {
        links.push({
          leftSlotId: leftSlot.id,
          rightSlotId: rightSlot.id,
          x1: leftSlot.x + 6,
          x2: rightSlot.x - 6,
          y1: leftSlot.y,
          y2: rightSlot.y,
          zone,
        });
      }
    }
  }

  const gkSlot = formationSlots.find((slot) => slot.zone === "GK");
  const gkCard = gkSlot ? cardById.get(assignments[gkSlot.id] ?? "") : undefined;
  const defenderSlots = formationSlots
    .filter((slot) => slot.zone === "DEF")
    .sort((a, b) => a.x - b.x);

  if (gkSlot && gkCard) {
    const leftDefender = findNearestDefenderBySide(defenderSlots, gkSlot.x, "left");
    const rightDefender = findNearestDefenderBySide(defenderSlots, gkSlot.x, "right");
    const leftDefenderCard = leftDefender ? cardById.get(assignments[leftDefender.id] ?? "") : undefined;
    const rightDefenderCard = rightDefender ? cardById.get(assignments[rightDefender.id] ?? "") : undefined;

    if (leftDefender && gkCard.chemistry.left && leftDefenderCard?.chemistry.right) {
      links.push({
        leftSlotId: leftDefender.id,
        rightSlotId: gkSlot.id,
        x1: leftDefender.x + 4,
        x2: gkSlot.x - 4,
        y1: leftDefender.y + 5,
        y2: gkSlot.y - 5,
        zone: "DEF",
      });
    }

    if (rightDefender && gkCard.chemistry.right && rightDefenderCard?.chemistry.left) {
      links.push({
        leftSlotId: gkSlot.id,
        rightSlotId: rightDefender.id,
        x1: gkSlot.x + 4,
        x2: rightDefender.x - 4,
        y1: gkSlot.y - 5,
        y2: rightDefender.y + 5,
        zone: "DEF",
      });
    }
  }

  return links;
}

function getLineupSummary(
  assignments: Record<string, string>,
  cardById: Map<string, LineupCard>,
  chemistryLinks: ChemistryLink[],
  formationSlots: FormationSlot[],
  staffEffects: StaffZoneEffect[] = [],
  captain: { captainId?: string | null; captainBoost?: number } = {},
) {
  const captainId = captain.captainId ?? null;
  const captainBoost = Math.trunc(Number(captain.captainBoost ?? 0));
  const diceZoneBonus = staffEffects
    .filter((e) => e.type === "dice_zone_bonus")
    .reduce((sum, e) => sum + (e.stars ?? 0), 0);

  const staffBonusForZone = (zone: "ATT" | "DEF" | "MID") =>
    staffEffects
      .filter((e) => e.type === "zone_bonus" && e.zone === zone)
      .reduce((sum, e) => sum + (e.stars ?? 0), 0) + diceZoneBonus;

  const summary = {
    ATT: { base: 0, chemistry: 0, staffBonus: staffBonusForZone("ATT"), total: 0 },
    DEF: { base: 0, chemistry: 0, staffBonus: staffBonusForZone("DEF"), total: 0 },
    MID: { base: 0, chemistry: 0, staffBonus: staffBonusForZone("MID"), total: 0 },
    players: 0,
    total: 0,
  };

  for (const slot of formationSlots) {
    const card = cardById.get(assignments[slot.id] ?? "");
    if (!card || !isLineupPlayerActive(card)) {
      continue;
    }

    const naturalPositions = card.positions.length ? card.positions : ["MID"];
    const penalty = getPositionPenalty(naturalPositions, slot.zone);
    const captainBonus = captainId && card.id === captainId ? captainBoost : 0;
    const value = applyPositionPenalty(getTotalSkillValue(card), penalty) + captainBonus;
    summary.players += 1;

    if (slot.zone === "GK") {
      summary.DEF.base += value;
    } else {
      summary[slot.zone].base += value;
    }
  }

  const chemistryMultiplier = staffEffects
    .filter((e) => e.type === "chemistry_multiplier")
    .reduce((best, e) => Math.max(best, e.factor ?? 1), 1);

  for (const link of chemistryLinks) {
    summary[link.zone].chemistry += chemistryMultiplier;
  }

  summary.ATT.total = summary.ATT.base + summary.ATT.chemistry + summary.ATT.staffBonus;
  summary.DEF.total = summary.DEF.base + summary.DEF.chemistry + summary.DEF.staffBonus;
  summary.MID.total = summary.MID.base + summary.MID.chemistry + summary.MID.staffBonus;
  summary.total = summary.ATT.total + summary.DEF.total + summary.MID.total;

  return summary;
}

function normalizeZone(value: string | undefined): PlayerCardPosition | "bench" | null {
  if (value === "GK" || value === "DEF" || value === "MID" || value === "ATT" || value === "bench") {
    return value;
  }

  return null;
}

function isSavedLineupZone(value: string | undefined) {
  return value === "GK" || value === "DEF" || value === "MID" || value === "ATT";
}

function findNearestDefenderBySide(defenderSlots: FormationSlot[], gkX: number, side: "left" | "right") {
  return defenderSlots
    .filter((slot) => (side === "left" ? slot.x < gkX : slot.x > gkX))
    .sort((a, b) => Math.abs(a.x - gkX) - Math.abs(b.x - gkX))[0];
}

function DraggedCard({ drag, player, showArchetypes }: { drag: DragState; player: LineupCard | undefined; showArchetypes: boolean }) {
  if (!player) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute z-30 w-[92px] scale-105 opacity-95 shadow-2xl"
      style={{ left: `${drag.x}%`, top: `${drag.y}%`, transform: "translate(-50%, -50%)" }}
    >
      <LineupPlayerCard player={player} showArchetypes={showArchetypes} variant="lineup" />
    </div>
  );
}

function LineupPlayerCard({
  offPosPenalty = 0,
  player,
  selected,
  showArchetypes = true,
  variant,
}: {
  offPosPenalty?: number;
  player: LineupCard;
  selected?: boolean;
  showArchetypes?: boolean;
  variant: "draft" | "lineup";
}) {
  const isOffPos = offPosPenalty > 0;
  const penaltyLabel = !isFinite(offPosPenalty) || offPosPenalty >= 10 ? "GK" : `-${offPosPenalty}★`;

  return (
    <div className={cn("relative", isLineupPlayerBlocked(player) ? "opacity-55 grayscale" : "")}>
      <PlayerCard disabled={isLineupPlayerBlocked(player)} player={player} selected={selected} showArchetypes={showArchetypes} variant={variant} />
      {player.injured ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/45">
          <span className="rounded bg-rose-500 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg">
            Verletzt
          </span>
        </div>
      ) : player.unavailable ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/45">
          <span className="rounded bg-amber-500 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg">
            Gesperrt
          </span>
        </div>
      ) : null}
      {isOffPos ? (
        <div className="pointer-events-none absolute bottom-1 left-0 right-0 z-10 flex justify-center">
          <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-lg">
            {penaltyLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function getLineupPayload(assignments: Record<string, string>, cardById: Map<string, LineupCard>, formationSlots: FormationSlot[]): LineupPayloadItem[] {
  return formationSlots.flatMap((slot, index) => {
    const card = cardById.get(assignments[slot.id] ?? "");

    if (!card || !isLineupPlayerActive(card) || card.lockedDefault) {
      return [];
    }

    return [
      {
        club_player_id: card.id,
        slot: index + 1,
        zone: slot.zone,
      },
    ];
  });
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

function getNearestSlot(x: number, y: number, formationSlots: FormationSlot[]) {
  const nearest = formationSlots
    .map((slot) => ({ distance: Math.hypot(slot.x - x, slot.y - y), slot }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest && nearest.distance <= 13 ? nearest.slot : null;
}

function canPlacePlayer(player: LineupCard) {
  return isLineupPlayerAssignable(player) && !player.lockedDefault;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
