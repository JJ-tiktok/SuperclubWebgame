"use client";

import { ChevronDown, CircleHelp } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { GameView } from "@/components/game/lib/dashboard-helpers";
import { filterVisibleSections, getViewGuide } from "@/components/game/lib/view-guides";
import { ViewSectionNav } from "@/components/game/shared/view-section-nav";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

function getCollapsedStorageKey(roomCode: string, view: GameView) {
  return `view-guide-collapsed:${roomCode}:${view}`;
}

export function ViewGuidePanel({
  hiddenSectionIds,
  roomCode,
  view,
}: {
  hiddenSectionIds?: string[];
  roomCode: string;
  view: GameView;
}) {
  const guide = getViewGuide(view);
  const contentId = useId();
  const storageKey = getCollapsedStorageKey(roomCode, view);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const sections = filterVisibleSections(guide.sections, hiddenSectionIds);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setCollapsed(false);
    }
    setHydrated(true);
  }, [storageKey]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  return (
    <Panel className="border-zinc-800 bg-zinc-950/85">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-500/30 bg-sky-500/10">
              <CircleHelp className="h-4 w-4 text-sky-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-400">Hilfe</p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-50">{guide.title}</p>
            </div>
          </div>
          <button
            aria-controls={contentId}
            aria-expanded={hydrated ? !collapsed : true}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
            onClick={toggleCollapsed}
            type="button"
          >
            {collapsed ? "Anzeigen" : "Einklappen"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", !collapsed && "rotate-180")} aria-hidden />
          </button>
        </div>

        {(!hydrated || !collapsed) && (
          <div className="mt-3 space-y-3" id={contentId}>
            <p className="text-sm text-zinc-400">{guide.summary}</p>
            {guide.tips?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-500">
                {guide.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            ) : null}
            {sections.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Bereiche auf dieser Seite</p>
                <ViewSectionNav sections={sections} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Panel>
  );
}
