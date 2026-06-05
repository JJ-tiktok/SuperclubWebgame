import { Circle, Square, Triangle } from "lucide-react";
import { formatStars } from "@/components/game/lib/dashboard-helpers";
import { ArchetypeMatchupGuide } from "@/components/game/shared/archetype-matchup-guide";
import { ARCHETYPE_META } from "@/lib/lobby/archetypes";
import type { ClubPlayerSnapshot, DraftPlayerRow, PlayerArchetype } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

type ArchetypeScoutCandidate = {
  archetype: PlayerArchetype;
  id: string;
  name: string;
  stars: number;
};

type ArchetypeScoutLine = {
  best: ArchetypeScoutCandidate | null;
  counts: Record<PlayerArchetype, number>;
  total: number;
  worst: ArchetypeScoutCandidate | null;
  zone: "ATT" | "DEF";
};

export type ArchetypeScout = {
  attack: ArchetypeScoutLine;
  defense: ArchetypeScoutLine;
  clubName: string;
};

function getPlayerPositions(player: DraftPlayerRow) {
  return (player.eligible_positions?.length ? player.eligible_positions : [player.position]).filter(Boolean);
}

function getArchetypeLabel(archetype: PlayerArchetype, zone: "ATT" | "DEF") {
  const meta = ARCHETYPE_META[archetype];
  return zone === "ATT" ? meta.attackLabel : meta.defenseLabel;
}

export function buildArchetypeScoutFromSquad(squad: ClubPlayerSnapshot[], clubName: string): ArchetypeScout {
  return {
    attack: buildArchetypeScoutLine(squad, "ATT"),
    clubName,
    defense: buildArchetypeScoutLine(squad, "DEF"),
  };
}

function buildArchetypeScoutLine(squad: ClubPlayerSnapshot[], zone: "ATT" | "DEF"): ArchetypeScoutLine {
  const candidates = squad
    .filter((owned) => !owned.injured && getPlayerPositions(owned.player).includes(zone))
    .flatMap((owned): ArchetypeScoutCandidate[] => {
      const archetype = zone === "ATT" ? owned.player.attacker_archetype : owned.player.defender_archetype;
      return archetype
        ? [{
            archetype,
            id: owned.id,
            name: owned.player.display_name,
            stars: Math.trunc(Number(owned.current_stars)),
          }]
        : [];
    })
    .sort((a, b) => {
      const stars = b.stars - a.stars;
      if (stars !== 0) return stars;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });

  const counts = (Object.keys(ARCHETYPE_META) as PlayerArchetype[]).reduce(
    (acc, archetype) => ({ ...acc, [archetype]: candidates.filter((candidate) => candidate.archetype === archetype).length }),
    { alpha: 0, beta: 0, gamma: 0 } satisfies Record<PlayerArchetype, number>,
  );

  return {
    best: candidates[0] ?? null,
    counts,
    total: candidates.length,
    worst: candidates.length > 1 ? candidates.at(-1) ?? null : null,
    zone,
  };
}

export function SquadArchetypeOverview({
  className,
  clubName,
  squad,
  showMatchupGuide = true,
}: {
  className?: string;
  clubName: string;
  squad: ClubPlayerSnapshot[];
  showMatchupGuide?: boolean;
}) {
  if (squad.length === 0) {
    return null;
  }

  const scout = buildArchetypeScoutFromSquad(squad, clubName);

  return (
    <div className={cn("space-y-3", className)}>
      {showMatchupGuide ? <ArchetypeMatchupGuide /> : null}
      <div className="rounded-md border border-zinc-800 bg-zinc-900/45 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Archetype-Profil</p>
            <p className="text-sm font-semibold text-zinc-100">Kader nach Angriff & Abwehr</p>
          </div>
          <p className="text-xs text-zinc-500">Basierend auf Position & Archetype</p>
        </div>
        <ArchetypeScoutCard scout={scout} />
      </div>
    </div>
  );
}

export function ArchetypeScoutCard({ scout }: { scout: ArchetypeScout }) {
  return (
    <div className="rounded border border-zinc-800 bg-black/20 p-3">
      <p className="truncate text-sm font-semibold text-zinc-100">{scout.clubName}</p>
      <div className="mt-3 grid gap-2">
        <ArchetypeScoutLineView line={scout.attack} />
        <ArchetypeScoutLineView line={scout.defense} />
      </div>
    </div>
  );
}

function ArchetypeScoutLineView({ line }: { line: ArchetypeScoutLine }) {
  const label = line.zone === "ATT" ? "Angriff" : "Abwehr";

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-zinc-500">
          {label} {line.total > 0 ? `(${line.total})` : ""}
        </span>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(ARCHETYPE_META) as PlayerArchetype[]).map((archetype) => (
            <span
              className="inline-flex h-6 min-w-8 items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-[11px] font-semibold text-zinc-300"
              key={`${line.zone}-${archetype}`}
              title={getArchetypeLabel(archetype, line.zone)}
            >
              <ArchetypeScoutIcon archetype={archetype} />
              {line.counts[archetype]}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
        <ArchetypeCandidateRow candidate={line.best} label="Top" zone={line.zone} />
        <ArchetypeCandidateRow candidate={line.worst} label="Low" zone={line.zone} />
      </div>
    </div>
  );
}

function ArchetypeCandidateRow({
  candidate,
  label,
  zone,
}: {
  candidate: ArchetypeScoutCandidate | null;
  label: string;
  zone: "ATT" | "DEF";
}) {
  if (!candidate) {
    return (
      <div className="flex items-center justify-between gap-2 text-zinc-600">
        <span>{label}</span>
        <span>-</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="w-7 shrink-0 text-zinc-600">{label}</span>
        <ArchetypeScoutIcon archetype={candidate.archetype} />
        <span className="truncate" title={`${candidate.name} - ${getArchetypeLabel(candidate.archetype, zone)}`}>
          {candidate.name}
        </span>
      </span>
      <span className="shrink-0 font-semibold text-zinc-200">{formatStars(candidate.stars)}</span>
    </div>
  );
}

function ArchetypeScoutIcon({ archetype }: { archetype: PlayerArchetype }) {
  const className = "h-3 w-3 shrink-0";
  const symbol = ARCHETYPE_META[archetype].symbol;

  if (symbol === "triangle") {
    return <Triangle className={className} fill="currentColor" strokeWidth={2.4} />;
  }

  if (symbol === "circle") {
    return <Circle className={className} fill="currentColor" strokeWidth={2.4} />;
  }

  return <Square className={className} fill="currentColor" strokeWidth={2.4} />;
}
