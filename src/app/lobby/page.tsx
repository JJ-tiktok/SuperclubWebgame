import { UserButton } from "@clerk/nextjs";
import { DevAdminMenu } from "@/components/dev/dev-admin-menu";
import { LobbyEntryForms } from "@/components/lobby/lobby-entry-forms";
import { SavedGamesList } from "@/components/lobby/saved-games-list";
import { getActiveCpuTeams } from "@/lib/lobby/cpu-teams";
import { getSavedGamesForCurrentUser } from "@/lib/lobby/data";
import { DEFAULT_LOBBY_SETTINGS } from "@/lib/lobby/rules";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SavedGameSummary } from "@/lib/lobby/types";
import { getServiceSupabaseConfigIssue } from "@/lib/supabase/config";
import { getErrorMessage, getSupabaseSetupHint } from "@/lib/supabase/errors";
import { isDevEnvironment } from "@/lib/dev/dev-tools";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const supabaseConfigIssue = getServiceSupabaseConfigIssue();
  let savedGames: SavedGameSummary[] = [];
  let savedGamesIssue = supabaseConfigIssue?.message ?? "";
  let cpuTeamsIssue = "";
  let cpuTeams: Awaited<ReturnType<typeof getActiveCpuTeams>> = [];

  if (!supabaseConfigIssue) {
    const supabase = createSupabaseServiceClient();
    try {
      savedGames = await getSavedGamesForCurrentUser();
    } catch (error) {
      savedGamesIssue = getSupabaseSetupHint(error) ?? getErrorMessage(error, "Spielstaende konnten nicht geladen werden.");
    }

    try {
      if (supabase) {
        cpuTeams = await getActiveCpuTeams(supabase);
      }
    } catch (error) {
      cpuTeamsIssue = getErrorMessage(error, "CPU-Mannschaften konnten nicht geladen werden.");
    }
  }

  const showDevMenu = isDevEnvironment();

  return (
    <main className="min-h-screen bg-[#07120d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-lime-300">Superclub Lobby</p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-50">Spiel erstellen oder beitreten</h1>
            {showDevMenu ? (
              <div className="mt-3">
                <DevAdminMenu variant="compact" />
              </div>
            ) : null}
          </div>
          <UserButton />
        </header>

        {savedGamesIssue ? (
          <div className="rounded-md border border-amber-800 bg-amber-950 px-4 py-3 text-sm text-amber-100">
            {savedGamesIssue}
          </div>
        ) : null}

        {cpuTeamsIssue ? (
          <div className="rounded-md border border-amber-800 bg-amber-950 px-4 py-3 text-sm text-amber-100">
            {cpuTeamsIssue}
          </div>
        ) : null}

        <SavedGamesList games={savedGames} />
        {showDevMenu ? <DevAdminMenu variant="panel" /> : null}
        <LobbyEntryForms cpuTeams={cpuTeams} defaultSettings={DEFAULT_LOBBY_SETTINGS} />
      </div>
    </main>
  );
}
