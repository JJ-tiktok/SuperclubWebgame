import { Circle, Square, Triangle } from "lucide-react";
import { ARCHETYPE_META } from "@/lib/lobby/archetypes";
import type { PlayerArchetype } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

const archetypeDuels: Array<{ attacker: PlayerArchetype; defender: PlayerArchetype }> = [
  { attacker: "alpha", defender: "beta" },
  { attacker: "beta", defender: "gamma" },
  { attacker: "gamma", defender: "alpha" },
];

export function ArchetypeMatchupGuide({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-md border border-zinc-800 bg-zinc-900/60 p-3", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Archetypes</p>
          <p className="text-sm font-semibold text-zinc-100">Angriff gegen Abwehr</p>
        </div>
        <p className="text-xs text-zinc-500">Gleiche Symbole neutralisieren sich.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {archetypeDuels.map((duel) => {
          const attacker = ARCHETYPE_META[duel.attacker];
          const defender = ARCHETYPE_META[duel.defender];

          return (
            <div
              className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-black/20 px-3 py-2"
              key={`${duel.attacker}-${duel.defender}`}
            >
              <ArchetypeName archetype={duel.attacker} label={attacker.attackLabel} tone="attack" />
              <span className="text-[11px] font-black uppercase text-zinc-500">schlaegt</span>
              <ArchetypeName archetype={duel.defender} label={defender.defenseLabel} tone="defense" />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Im Angriffsdrittel zaehlen nur Spieler mit Archetype: bester gegen bester, schwaechster gegen schwaechster.
        Spieler ohne Archetype werden ignoriert.
      </p>
    </div>
  );
}

function ArchetypeName({
  archetype,
  label,
  tone,
}: {
  archetype: PlayerArchetype;
  label: string;
  tone: "attack" | "defense";
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded border",
          tone === "attack"
            ? "border-emerald-500/50 bg-emerald-950/50 text-emerald-200"
            : "border-sky-500/50 bg-sky-950/50 text-sky-200",
        )}
      >
        <ArchetypeGuideIcon archetype={archetype} />
      </span>
      <span className="min-w-0 truncate text-xs font-semibold text-zinc-200">{label}</span>
    </span>
  );
}

function ArchetypeGuideIcon({ archetype }: { archetype: PlayerArchetype }) {
  const className = "h-3.5 w-3.5";
  const symbol = ARCHETYPE_META[archetype].symbol;

  if (symbol === "triangle") {
    return <Triangle className={className} fill="currentColor" strokeWidth={2.4} />;
  }

  if (symbol === "circle") {
    return <Circle className={className} fill="currentColor" strokeWidth={2.4} />;
  }

  return <Square className={className} fill="currentColor" strokeWidth={2.4} />;
}
