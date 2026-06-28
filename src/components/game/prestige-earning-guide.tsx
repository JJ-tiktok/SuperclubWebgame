"use client";

import { Info } from "lucide-react";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PHILOSOPHIES, PRESTIGE_EARNING_RULES, prestigePointsClassNameFromLabel } from "@/lib/lobby/prestige";
import { cn } from "@/lib/utils";

export function PrestigeEarningGuide({ compact = false }: { compact?: boolean }) {
  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>So sammelst du Prestige</PanelTitle>
          <PanelDescription>
            {compact
              ? "Kurzuebersicht der Prestige-Quellen im Spiel."
              : "Alle Wege zu Prestigepunkten — Saisonboni, Continental Cup, Sponsoring, Infrastruktur und Philosophien."}
          </PanelDescription>
        </div>
        <Info size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      <div className="space-y-2">
        {PRESTIGE_EARNING_RULES.map((rule) => (
          <div
            key={rule.label}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200">{rule.label}</p>
              <p className="text-xs text-zinc-500">
                {rule.frequency}
                {rule.note ? ` — ${rule.note}` : ""}
              </p>
            </div>
            <p className={cn("shrink-0 text-sm font-semibold", prestigePointsClassNameFromLabel(rule.points))}>
              {rule.points}
            </p>
          </div>
        ))}
      </div>

      {!compact ? (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Vereinsphilosophien (Lobby)</p>
          {PHILOSOPHIES.map((philosophy) => (
            <div
              key={philosophy.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/30 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-200">{philosophy.label}</p>
                <p className="text-sm font-semibold text-lime-300">+{philosophy.reward}</p>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{philosophy.goal}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
