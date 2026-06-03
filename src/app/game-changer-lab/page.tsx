import { FlaskConical, RefreshCw } from "lucide-react";
import Link from "next/link";
import { GameChangerLab, type ApplyFeedback } from "@/components/game-changer-lab/game-changer-lab";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { loadGameChangerCatalog } from "@/app/game-changer-lab/load-catalog";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    apply_ok?: string;
    apply_error?: string;
    room?: string;
    card?: string;
    status?: string;
    details?: string;
  }>;
};

export default async function GameChangerLabPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await loadGameChangerCatalog();
  const isDev = process.env.NODE_ENV !== "production";
  const applyFeedback = parseApplyFeedback(sp);

  return (
    <main className="min-h-screen bg-[#07100d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-lg border border-violet-900/70 bg-zinc-950/90">
          <div className="h-1.5 bg-violet-500" />
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">Dev</Badge>
                <Badge>game_changer_cards</Badge>
                <Badge>{result.ok ? `${result.cards.length} Karten` : "Fehler"}</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Game-Changer-Lab</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Glossar aller Karten aus Supabase plus Dry-Run der Engine-Pfade und optionales Live-Apply auf deinen Club.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                href="/game-changer-lab"
              >
                <RefreshCw size={16} aria-hidden />
                Neu laden
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                href="/player-db-test"
              >
                Spieler-DB
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

        {!result.ok ? (
          <Panel className="border-rose-900/70 bg-zinc-950/85">
            <PanelHeader>
              <div>
                <PanelTitle>Katalog konnte nicht geladen werden</PanelTitle>
                <PanelDescription>{result.error}</PanelDescription>
              </div>
              <FlaskConical size={18} className="text-rose-300" aria-hidden />
            </PanelHeader>
          </Panel>
        ) : (
          <GameChangerLab cards={result.cards} isDev={isDev} applyFeedback={applyFeedback} />
        )}
      </div>
    </main>
  );
}

function parseApplyFeedback(sp: Awaited<PageProps["searchParams"]>): ApplyFeedback | null {
  if (sp.apply_ok === "1") {
    return {
      ok: true,
      room: sp.room,
      card: sp.card,
      status: sp.status,
      details: sp.details,
    };
  }
  if (sp.apply_error) {
    return { ok: false, error: decodeURIComponent(sp.apply_error) };
  }
  return null;
}
