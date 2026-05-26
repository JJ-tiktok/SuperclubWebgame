import { Database, RefreshCw } from "lucide-react";
import Link from "next/link";
import { PlayerCard } from "@/components/player-card/PlayerCard";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { DRAFT_PLAYER_SELECT, mapDbPlayerToPlayerCardData } from "@/lib/lobby/draft";
import type { DraftPlayerRow } from "@/lib/lobby/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { calculateCardChemistryBonus } from "@/types/player-card";

export const dynamic = "force-dynamic";

export default async function PlayerDbTestPage() {
  const result = await loadPlayers();

  return (
    <main className="min-h-screen bg-[#07100d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-lg border border-emerald-900/70 bg-zinc-950/90">
          <div className="h-1.5 bg-emerald-500" />
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">DB Test</Badge>
                <Badge>players</Badge>
                <Badge>{result.ok ? `${result.players.length} geladen` : "Fehler"}</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Spielerkarten aus Supabase</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Diese Seite lädt echte Datensätze aus `public.players` und rendert daraus unsere dynamischen Karten.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                href="/player-db-test"
              >
                <RefreshCw size={16} aria-hidden />
                Neu laden
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                href="/draft-test"
              >
                Draft-Test
              </Link>
            </div>
          </div>
        </header>

        {!result.ok ? <ErrorPanel message={result.error} /> : null}

        {result.ok && result.players.length === 0 ? (
          <Panel className="border-amber-900/70 bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Keine Spieler gefunden</PanelTitle>
                <PanelDescription>
                  Es wurden keine sichtbaren Spieler gefunden. Fuer den Draft-Test brauchen Spieler `visibility = public` oder `room`.
                </PanelDescription>
              </div>
              <Database size={18} className="text-amber-300" aria-hidden />
            </PanelHeader>
          </Panel>
        ) : null}

        {result.ok && result.players.length > 0 ? (
          <PlayerGrid players={result.players} />
        ) : null}
      </div>
    </main>
  );
}

function PlayerGrid({ players }: { players: DraftPlayerRow[] }) {
  const cards = players.map(mapDbPlayerToPlayerCardData);
  const chemistryBonus = calculateCardChemistryBonus(cards);

  return (
    <section className="space-y-4">
      <Panel className="border-emerald-900/70 bg-zinc-950/85">
        <PanelHeader>
          <div>
            <PanelTitle>Chemistry Preview</PanelTitle>
            <PanelDescription>
              Link + Link ergibt +1. Aktuell waeren in dieser Ansicht {chemistryBonus} Chemistry-Boni moeglich.
            </PanelDescription>
          </div>
          <Badge tone="amber">+{chemistryBonus}</Badge>
        </PanelHeader>
      </Panel>

      <div className="grid gap-x-7 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {players.map((player, index) => {
          const card = cards[index];
          const nextCard = cards[index + 1];
          const linkedToNext = Boolean(card?.chemistry.right && nextCard?.chemistry.left);

          return (
            <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/80 p-2" key={player.id}>
              <PlayerCard player={card} variant="draft" />
              {linkedToNext ? <ChemistryBridge /> : null}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <Info label="Content Key" value={player.content_key ?? player.id} />
                  <Info label="Visibility" value={player.visibility ?? "-"} />
                  <Info label="Region" value={player.region ?? "-"} />
                  <Info label="Eligible" value={(player.eligible_positions ?? [player.position]).join("/")} />
                </div>
              </div>
          );
        })}
      </div>
    </section>
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

async function loadPlayers(): Promise<{ ok: true; players: DraftPlayerRow[] } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    return { ok: false, error: "Supabase Service Client ist nicht konfiguriert." };
  }

  const { data, error } = await supabase
    .from("players")
    .select(DRAFT_PLAYER_SELECT)
    .in("visibility", ["public", "room"])
    .order("created_at", { ascending: false })
    .limit(48)
    .returns<DraftPlayerRow[]>();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, players: data ?? [] };
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
      <p className="font-medium uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-zinc-200">{value}</p>
    </div>
  );
}
