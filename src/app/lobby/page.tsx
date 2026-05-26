import { UserButton } from "@clerk/nextjs";
import { LobbyEntryForms } from "@/components/lobby/lobby-entry-forms";
import { SavedGamesList } from "@/components/lobby/saved-games-list";
import { getSavedGamesForCurrentUser } from "@/lib/lobby/data";
import { DEFAULT_LOBBY_SETTINGS } from "@/lib/lobby/rules";
import type { SavedGameSummary } from "@/lib/lobby/types";
import { getServiceSupabaseConfigIssue } from "@/lib/supabase/config";
import { getErrorMessage, getSupabaseSetupHint } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const supabaseConfigIssue = getServiceSupabaseConfigIssue();
  let savedGames: SavedGameSummary[] = [];
  let savedGamesIssue = supabaseConfigIssue?.message ?? "";

  if (!supabaseConfigIssue) {
    try {
      savedGames = await getSavedGamesForCurrentUser();
    } catch (error) {
      savedGamesIssue = getSupabaseSetupHint(error) ?? getErrorMessage(error, "Spielstaende konnten nicht geladen werden.");
    }
  }

  return (
    <main className="min-h-screen bg-[#07120d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-lime-300">Superclub Lobby</p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-50">Spiel erstellen oder beitreten</h1>
          </div>
          <UserButton />
        </header>

        {savedGamesIssue ? (
          <div className="rounded-md border border-amber-800 bg-amber-950 px-4 py-3 text-sm text-amber-100">
            {savedGamesIssue}
          </div>
        ) : null}

        <SavedGamesList games={savedGames} />
        <LobbyEntryForms defaultSettings={DEFAULT_LOBBY_SETTINGS} />
      </div>
    </main>
  );
}
