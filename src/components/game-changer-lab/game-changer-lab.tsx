"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FlaskConical, BookOpen, AlertTriangle } from "lucide-react";
import { devApplyGameChangerAction } from "@/app/game-changer-lab/actions";
import type { GameChangerCatalogCard } from "@/app/game-changer-lab/load-catalog";
import {
  APPLICATION_MODE_LABELS,
  type GameChangerApplicationMode,
} from "@/lib/game/game-changer-catalog";
import { PENDING_SCOPE_LABELS } from "@/lib/game/game-changer-ui";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { GameChangerCategory } from "@/lib/lobby/types";

type TabId = "glossary" | "lab";

export type ApplyFeedback = {
  ok: boolean;
  room?: string;
  card?: string;
  status?: string;
  details?: string;
  error?: string;
};

type Props = {
  cards: GameChangerCatalogCard[];
  isDev: boolean;
  applyFeedback: ApplyFeedback | null;
  initialTab?: TabId;
  initialRoomCode?: string;
};

const CATEGORY_OPTIONS: { value: "all" | GameChangerCategory; label: string }[] = [
  { value: "all", label: "Alle Kategorien" },
  { value: "good_news", label: "Good News" },
  { value: "bad_news", label: "Bad News" },
  { value: "secret_weapon", label: "Secret Weapon" },
];

const PLAY_WINDOW_OPTIONS = [
  { value: "all", label: "Alle Fenster" },
  { value: "matchday", label: "matchday" },
  { value: "offseason", label: "offseason" },
  { value: "any", label: "any" },
];

const MODE_TONE: Record<GameChangerApplicationMode, "green" | "amber" | "red" | "blue" | "neutral"> = {
  immediate: "green",
  pending: "amber",
  choice: "blue",
  targeted_injury: "red",
  match_card: "blue",
  unsupported: "neutral",
};

export function GameChangerLab({ cards, isDev, applyFeedback, initialTab = "glossary", initialRoomCode = "" }: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | GameChangerCategory>("all");
  const [playWindowFilter, setPlayWindowFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(cards[0]?.id ?? null);
  const [roomCode, setRoomCode] = useState(applyFeedback?.room ?? initialRoomCode);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter((card) => {
        if (categoryFilter !== "all" && card.category !== categoryFilter) return false;
        if (playWindowFilter !== "all" && (card.play_window ?? "") !== playWindowFilter) return false;
        if (!q) return true;
        const hay = `${card.display_name} ${card.content_key} ${card.description} ${card.summary.descriptions.join(" ")}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "de"));
  }, [cards, query, categoryFilter, playWindowFilter]);

  const selected = cards.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-5">
      {isDev ? (
        <Panel className="border-amber-800/80 bg-amber-950/30">
          <PanelHeader>
            <div>
              <PanelTitle className="flex items-center gap-2 text-amber-100">
                <AlertTriangle size={18} aria-hidden />
                Development-Labor
              </PanelTitle>
              <PanelDescription className="text-amber-200/80">
                Live-Apply veraendert den echten Spielstand deines Clubs. Nur fuer lokale Tests – nicht in Production.
              </PanelDescription>
            </div>
          </PanelHeader>
        </Panel>
      ) : null}

      {applyFeedback ? (
        <Panel className={applyFeedback.ok ? "border-emerald-800/70 bg-emerald-950/25" : "border-rose-800/70 bg-rose-950/25"}>
          <PanelHeader>
            <div>
              <PanelTitle>{applyFeedback.ok ? "Karte angewendet" : "Apply fehlgeschlagen"}</PanelTitle>
              <PanelDescription>
                {applyFeedback.ok ? (
                  <>
                    {applyFeedback.card} in Raum {applyFeedback.room} – Status: {applyFeedback.status}
                    {applyFeedback.details ? ` – ${applyFeedback.details}` : null}
                    {applyFeedback.room ? (
                      <>
                        {" "}
                        <Link
                          className="text-emerald-300 underline"
                          href={`/games/${applyFeedback.room}?view=grounds#game-changer`}
                        >
                          Zum Spiel
                        </Link>
                      </>
                    ) : null}
                  </>
                ) : (
                  applyFeedback.error
                )}
              </PanelDescription>
            </div>
          </PanelHeader>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        <TabButton active={tab === "glossary"} onClick={() => setTab("glossary")} icon={<BookOpen size={16} />}>
          Glossar
        </TabButton>
        <TabButton active={tab === "lab"} onClick={() => setTab("lab")} icon={<FlaskConical size={16} />}>
          Labor
        </TabButton>
      </div>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        playWindowFilter={playWindowFilter}
        onPlayWindowChange={setPlayWindowFilter}
        count={filtered.length}
      />

      {tab === "glossary" ? (
        <GlossaryTab
          cards={filtered}
          onOpenInLab={(id) => {
            setSelectedId(id);
            setTab("lab");
          }}
        />
      ) : (
        <LabTab
          cards={filtered}
          selected={selected}
          onSelect={setSelectedId}
          isDev={isDev}
          roomCode={roomCode}
          onRoomCodeChange={setRoomCode}
        />
      )}

      <LegendPanel />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
        active ? "bg-emerald-700 text-white" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function FilterBar({
  query,
  onQueryChange,
  categoryFilter,
  onCategoryChange,
  playWindowFilter,
  onPlayWindowChange,
  count,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  categoryFilter: "all" | GameChangerCategory;
  onCategoryChange: (v: "all" | GameChangerCategory) => void;
  playWindowFilter: string;
  onPlayWindowChange: (v: string) => void;
  count: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-zinc-400">
        Suche
        <input
          className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Name, content_key, Effekt …"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Kategorie
        <select
          className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value as "all" | GameChangerCategory)}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        play_window
        <select
          className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
          value={playWindowFilter}
          onChange={(e) => onPlayWindowChange(e.target.value)}
        >
          {PLAY_WINDOW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <Badge tone="neutral">{count} Karten</Badge>
    </div>
  );
}

function GlossaryTab({ cards, onOpenInLab }: { cards: GameChangerCatalogCard[]; onOpenInLab: (id: string) => void }) {
  if (cards.length === 0) {
    return <p className="text-sm text-zinc-400">Keine Karten fuer die aktuelle Filterung.</p>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {cards.map((card) => (
        <CardTile key={card.id} card={card} onOpenLab={() => onOpenInLab(card.id)} showLabLink />
      ))}
    </div>
  );
}

function LabTab({
  cards,
  selected,
  onSelect,
  isDev,
  roomCode,
  onRoomCodeChange,
}: {
  cards: GameChangerCatalogCard[];
  selected: GameChangerCatalogCard | null;
  onSelect: (id: string) => void;
  isDev: boolean;
  roomCode: string;
  onRoomCodeChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border border-zinc-800 p-2">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
              selected?.id === card.id
                ? "border-emerald-600 bg-emerald-950/50 text-zinc-50"
                : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            <span className="font-medium">{card.display_name}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{card.content_key}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {selected ? (
          <>
            <CardTile card={selected} />
            <DryRunPanel card={selected} />
            {isDev ? (
              <form action={devApplyGameChangerAction} className="space-y-3 rounded-lg border border-rose-900/60 bg-zinc-950/90 p-4">
                <h3 className="text-sm font-semibold text-rose-200">Live-Apply (Development)</h3>
                <input type="hidden" name="game_changer_card_id" value={selected.id} />
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  Raumcode
                  <input
                    name="room_code"
                    required
                    className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm uppercase text-zinc-100"
                    value={roomCode}
                    onChange={(e) => onRoomCodeChange(e.target.value.toUpperCase())}
                    placeholder="z.B. ABCD12"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-medium text-white hover:bg-rose-600"
                >
                  Karte auf meinen Club anwenden
                </button>
              </form>
            ) : (
              <p className="text-sm text-zinc-500">Live-Apply ist im Production-Build deaktiviert.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">Waehle links eine Karte.</p>
        )}
      </div>
    </div>
  );
}

function CardTile({
  card,
  onOpenLab,
  showLabLink,
}: {
  card: GameChangerCatalogCard;
  onOpenLab?: () => void;
  showLabLink?: boolean;
}) {
  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-950/85 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">{card.display_name}</h3>
          <p className="text-xs text-zinc-500">{card.content_key}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge tone="green">{card.categoryLabel}</Badge>
          {card.timing ? <Badge>{card.timing}</Badge> : null}
          {card.play_window ? <Badge>{card.play_window}</Badge> : null}
          <Badge tone="neutral">Gewicht {card.draw_weight}</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{card.description}</p>
      <ul className="mt-3 space-y-2">
        {card.summary.rows.map((row, idx) => (
          <li key={idx} className="rounded border border-zinc-800/80 bg-zinc-900/50 px-2 py-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ModeBadge mode={row.mode} />
              {row.scopeLabel ? <Badge tone="amber">{row.scopeLabel}</Badge> : null}
            </div>
            <p className="mt-1 text-zinc-200">{row.description}</p>
            {row.choiceHint ? <p className="mt-0.5 text-xs text-violet-300">{row.choiceHint}</p> : null}
          </li>
        ))}
      </ul>
      {showLabLink && onOpenLab ? (
        <button type="button" onClick={onOpenLab} className="mt-2 text-xs text-emerald-400 underline">
          Im Labor oeffnen
        </button>
      ) : null}
    </article>
  );
}

function ModeBadge({ mode }: { mode: GameChangerApplicationMode }) {
  return <Badge tone={MODE_TONE[mode]}>{APPLICATION_MODE_LABELS[mode]}</Badge>;
}

function DryRunPanel({ card }: { card: GameChangerCatalogCard }) {
  const modes = card.summary.modes.map((m) => APPLICATION_MODE_LABELS[m]).join(", ");
  const scopes = card.summary.scopes
    .map((s) => PENDING_SCOPE_LABELS[s as keyof typeof PENDING_SCOPE_LABELS] ?? s)
    .join(", ");

  return (
    <Panel className="border-violet-900/60 bg-zinc-950/90">
      <PanelHeader>
        <div>
          <PanelTitle>Dry-Run (Engine-Pfad)</PanelTitle>
          <PanelDescription>
            Modi: {modes || "–"}
            {scopes ? ` · Pending-Scopes: ${scopes}` : ""}
            {card.summary.hasMatchCard ? " · Match-Effekte werden im Spieltag ausgeloest" : ""}
          </PanelDescription>
        </div>
      </PanelHeader>
      <ul className="space-y-2 px-4 pb-4">
        {card.summary.rows.map((row, idx) => (
          <li key={idx} className="text-sm text-zinc-300">
            <ModeBadge mode={row.mode} /> {row.description}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LegendPanel() {
  return (
    <Panel className="border-zinc-800 bg-zinc-950/70">
      <PanelHeader>
        <div>
          <PanelTitle>Legende</PanelTitle>
          <PanelDescription>Kategorien und Pending-Scopes (wie im Spiel-UI)</PanelDescription>
        </div>
      </PanelHeader>
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Kategorien</p>
          <ul className="space-y-1 text-sm text-zinc-300">
            <li>Good News – positive Karten</li>
            <li>Bad News – negative Karten</li>
            <li>Secret Weapon – Match-/Geheimwaffen-Effekte</li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Pending-Scopes</p>
          <ul className="space-y-1 text-sm text-zinc-300">
            {Object.entries(PENDING_SCOPE_LABELS).map(([key, label]) => (
              <li key={key}>
                <code className="text-zinc-500">{key}</code> – {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Anwendungsmodi</p>
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(APPLICATION_MODE_LABELS) as GameChangerApplicationMode[]).map((mode) => (
              <li key={mode}>
                <ModeBadge mode={mode} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
