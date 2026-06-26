"use client";

import Link from "next/link";
import { formatStars } from "@/components/game/lib/dashboard-helpers";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { HallOfFameCategorySnapshot, HallOfFameEntry, HallOfFameSnapshot } from "@/lib/lobby/types";
import { Award, Clock3, Sparkles, Star, TrendingUp } from "lucide-react";
import { useState } from "react";

const CATEGORY_ICONS = {
  tenure: Clock3,
  training: TrendingUp,
  development: Sparkles,
  skill_max: Star,
} as const;

type HallOfFameTab = "own_club" | "league";

export function HallOfFameView({
  hallOfFame,
  roomCode,
}: {
  hallOfFame: HallOfFameSnapshot | null;
  roomCode: string;
}) {
  const [tab, setTab] = useState<HallOfFameTab>("own_club");
  const categories = tab === "own_club" ? (hallOfFame?.own_club ?? []) : (hallOfFame?.league ?? []);

  return (
    <div className="space-y-4">
      <Panel className="border-[var(--club-border)] bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Hall of Fame</PanelTitle>
            <PanelDescription>
              Vereinslegenden, Trainingshelden und die groessten Entwicklungen — inklusive eigener Spielernamen.
            </PanelDescription>
          </div>
          <Award size={18} className="text-[var(--club-color)]" aria-hidden />
        </PanelHeader>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "own_club"} label="Mein Verein" onClick={() => setTab("own_club")} />
          <TabButton active={tab === "league"} label="Liga" onClick={() => setTab("league")} />
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Trainingshelden zaehlen nur Sterne aus echtem Training — nicht Game-Changer oder Sponsoring.
        </p>
      </Panel>

      {!hallOfFame ? (
        <Panel className="border-zinc-800 bg-zinc-950/70">
          <p className="text-sm text-zinc-400">Hall-of-Fame-Daten werden geladen …</p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {categories.map((category) => (
            <HallOfFameCategoryCard category={category} key={category.id} showClub={tab === "league"} />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-zinc-600">
        <Link className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline" href={`/games/${roomCode}?view=dashboard`}>
          Zurueck zum Dashboard
        </Link>
      </p>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-[var(--club-color)] text-white" : "border border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-900"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function HallOfFameCategoryCard({
  category,
  showClub,
}: {
  category: HallOfFameCategorySnapshot;
  showClub: boolean;
}) {
  const Icon = CATEGORY_ICONS[category.id];

  return (
    <Panel className="border-zinc-800 bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle className="text-base">{category.label}</PanelTitle>
          <PanelDescription>Top {category.entries.length || 0} Eintraege</PanelDescription>
        </div>
        <Icon size={16} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      {category.entries.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine Eintraege in dieser Kategorie.</p>
      ) : (
        <ol className="space-y-2">
          {category.entries.map((entry) => (
            <HallOfFameEntryRow entry={entry} key={`${category.id}-${entry.club_player_id}-${entry.rank}`} showClub={showClub} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function HallOfFameEntryRow({ entry, showClub }: { entry: HallOfFameEntry; showClub: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <span className="mt-0.5 w-6 shrink-0 text-center text-sm font-bold tabular-nums text-zinc-500">#{entry.rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-zinc-50" title={entry.display_name}>
            {entry.display_name}
          </p>
          {entry.custom_name?.trim() ? (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">umbenannt</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {entry.position ? `${entry.position} · ` : ""}
          {entry.metric_label}
        </p>
        {showClub ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.club_color ?? "#71717a" }}
              aria-hidden
            />
            <span className="truncate">{entry.club_name}</span>
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-zinc-200">{formatStars(entry.current_stars)}</p>
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">aktuell</p>
      </div>
    </li>
  );
}
