"use client";

import { Handshake, Trophy } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { pickSponsorRewardPlayerAction, signSponsorDealAction } from "@/app/games/actions/offseason";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ClubStatus } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import {
  getAccessiblePrestigeTiers,
  isSponsorSigningPhase,
  SPONSOR_PRESTIGE_LABELS,
} from "@/lib/lobby/sponsoring";
import type { ClubOverviewSnapshot, LobbyClub, LobbySnapshot } from "@/lib/lobby/types";

function sponsorStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Aktiv";
    case "completed":
      return "Erfolgreich";
    case "failed":
      return "Gescheitert";
    case "awaiting_reward_pick":
      return "Belohnung wählen";
    default:
      return status;
  }
}

function sponsorStatusTone(status: string): "green" | "amber" | "red" | "neutral" {
  switch (status) {
    case "active":
      return "amber";
    case "completed":
      return "green";
    case "failed":
      return "red";
    default:
      return "neutral";
  }
}

export function SponsorPanel({
  ownClub,
  overview,
  snapshot,
}: {
  ownClub: LobbyClub;
  overview: NonNullable<LobbySnapshot["club_overview"]>;
  snapshot: LobbySnapshot;
}) {
  const searchParams = useSearchParams();
  const sponsorError = searchParams.get("sponsor_error");
  const signingPhase = isSponsorSigningPhase(snapshot.game.phase);
  const [confirmDealId, setConfirmDealId] = useState<string | null>(null);

  const activeContract = overview.sponsor_contract;
  const prestigeTier = overview.sponsor_prestige_tier as ClubStatus;
  const prestigeLabel = overview.sponsor_prestige_label;
  const accessibleTiers = useMemo(() => getAccessiblePrestigeTiers(prestigeTier), [prestigeTier]);
  const [selectedTier, setSelectedTier] = useState<ClubStatus>(prestigeTier);

  useEffect(() => {
    setSelectedTier(prestigeTier);
  }, [prestigeTier]);

  const consumedTierSet = useMemo(() => {
    const tiers = new Set<string>(overview.sponsor_history.map((entry) => entry.prestige_tier));
    if (activeContract) {
      tiers.add(activeContract.prestige_tier);
    }
    return tiers;
  }, [activeContract, overview.sponsor_history]);

  const selectedTierDeals = overview.available_sponsor_deals.filter((deal) => deal.prestige_tier === selectedTier);
  const selectedTierConsumed = consumedTierSet.has(selectedTier);
  const selectedTierLabel = SPONSOR_PRESTIGE_LABELS[selectedTier] ?? selectedTier;
  const isCurrentTier = selectedTier === prestigeTier;

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="sponsoring">
      <PanelHeader>
        <div>
          <PanelTitle>Sponsoring</PanelTitle>
          <PanelDescription>
            Deals nach Prestige-Stufe — auch niedrigere Stufen nachholen, solange noch nicht verbraucht. Aktuell:{" "}
            {prestigeLabel}. Nur in der Off-Season abschliessbar, maximal ein aktiver Vertrag.
          </PanelDescription>
        </div>
        <Handshake size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      {sponsorError ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {decodeURIComponent(sponsorError)}
        </p>
      ) : null}

      {activeContract ? (
        <div className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">Aktiver Vertrag</p>
              <p className="mt-1 text-lg font-bold text-zinc-50">{activeContract.display_name}</p>
              <p className="mt-1 text-sm text-zinc-300">{activeContract.task_description}</p>
            </div>
            <Badge tone={sponsorStatusTone(activeContract.status)}>{sponsorStatusLabel(activeContract.status)}</Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p className="text-xs text-zinc-500">Fortschritt</p>
              <p className="font-semibold text-zinc-100">{activeContract.progress_label}</p>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p className="text-xs text-zinc-500">Laufzeit</p>
              <p className="font-semibold text-zinc-100">
                Saison {activeContract.signed_season}–{activeContract.ends_season} ({activeContract.duration_seasons}{" "}
                Saison{activeContract.duration_seasons === 1 ? "" : "en"})
              </p>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 sm:col-span-2">
              <p className="text-xs text-zinc-500">Belohnung bei Erfolg</p>
              <p className="font-semibold text-emerald-300">{activeContract.reward_description}</p>
            </div>
          </div>

          {activeContract.needs_player_pick ? (
            <SponsorRewardPickForm
              contract={activeContract}
              gameId={snapshot.game.id}
              roomCode={snapshot.game.room_code}
              squad={overview.squad}
            />
          ) : null}
        </div>
      ) : null}

      {!activeContract && accessibleTiers.length > 0 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {accessibleTiers.map((tier) => {
            const tierLabel = SPONSOR_PRESTIGE_LABELS[tier] ?? tier;
            const tierConsumed = consumedTierSet.has(tier);
            const tierActive = selectedTier === tier;
            const tierDealCount = overview.available_sponsor_deals.filter((deal) => deal.prestige_tier === tier).length;

            return (
              <button
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition",
                  tierActive
                    ? "border-[var(--club-border)] bg-[var(--club-soft)] text-zinc-50"
                    : "border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-900",
                  tierConsumed && !tierActive ? "opacity-60" : "",
                )}
                key={tier}
                onClick={() => {
                  setSelectedTier(tier);
                  setConfirmDealId(null);
                }}
                type="button"
              >
                <span>{tierLabel}</span>
                {tier === prestigeTier ? <Badge tone="blue">aktuell</Badge> : null}
                {tierConsumed ? <Badge tone="neutral">verbraucht</Badge> : null}
                {!tierConsumed && tierDealCount > 0 ? <Badge>{tierDealCount}</Badge> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {!activeContract && selectedTierDeals.length > 0 ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {selectedTierLabel}
            {isCurrentTier ? " · deine aktuelle Stufe" : " · niedrigere Stufe"}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {selectedTierDeals.map((deal) => {
              const isConfirming = confirmDealId === deal.id;
              return (
                <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4" key={deal.id}>
                  <p className="font-semibold text-zinc-50">{deal.display_name}</p>
                  <p className="mt-1 text-xs text-zinc-400">{deal.task_description}</p>
                  <p className="mt-2 text-xs text-emerald-300">Belohnung: {deal.reward_description}</p>
                  <p className="mt-2 text-[11px] italic text-zinc-500">{deal.flavor_text}</p>
                  <p className="mt-2 text-[11px] text-zinc-600">
                    Laufzeit: {deal.duration_seasons} Saison{deal.duration_seasons === 1 ? "" : "en"}
                  </p>
                  {!isConfirming ? (
                    <Button
                      className="mt-3 w-full"
                      disabled={!signingPhase}
                      onClick={() => setConfirmDealId(deal.id)}
                      title={signingPhase ? "Deal abschliessen" : "Nur in der Off-Season"}
                      type="button"
                      variant="secondary"
                    >
                      {signingPhase ? "Deal wählen" : "Nur Off-Season"}
                    </Button>
                  ) : (
                    <form action={signSponsorDealAction} className="mt-3 space-y-2">
                      <input name="game_id" type="hidden" value={snapshot.game.id} />
                      <input name="room_code" type="hidden" value={snapshot.game.room_code} />
                      <input name="deal_id" type="hidden" value={deal.id} />
                      <p className="text-xs text-amber-200">Vertrag wirklich abschliessen? Die Stufe ist danach verbraucht.</p>
                      <div className="flex gap-2">
                        <Button className="flex-1" disabled={!signingPhase} type="submit">
                          Bestätigen
                        </Button>
                        <Button className="flex-1" onClick={() => setConfirmDealId(null)} type="button" variant="ghost">
                          Abbrechen
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!activeContract && selectedTierDeals.length === 0 && !selectedTierConsumed ? (
        <p className="text-sm text-zinc-500">Noch keine Sponsoring-Deals für {selectedTierLabel} verfügbar.</p>
      ) : null}

      {!activeContract && selectedTierDeals.length === 0 && selectedTierConsumed ? (
        <p className="text-sm text-zinc-500">
          Die Prestige-Stufe {selectedTierLabel} wurde bereits verbraucht.
          {isCurrentTier
            ? " Höhere Deals werden frei, sobald du in der Managerwertung aufsteigst."
            : " Wähle eine andere Stufe im Tab oben."}
        </p>
      ) : null}

      {overview.sponsor_history.length > 0 ? (
        <div className={cn(activeContract || overview.available_sponsor_deals.length ? "mt-4 border-t border-zinc-800 pt-4" : "")}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Verbrauchte Stufen</p>
          <div className="space-y-2">
            {overview.sponsor_history.map((entry) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm"
                key={entry.id}
              >
                <div>
                  <p className="font-medium text-zinc-200">
                    {entry.display_name}{" "}
                    <span className="text-xs text-zinc-500">({entry.prestige_label})</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    Saison {entry.signed_season} · {entry.reward_description}
                  </p>
                </div>
                <Badge tone={sponsorStatusTone(entry.status)}>{sponsorStatusLabel(entry.status)}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {overview.stadium_upgrade_blocked_by_sponsor ? (
        <p className="mt-3 text-xs text-amber-300">
          <Trophy className="mr-1 inline size-3.5" aria-hidden />
          Stadionausbau gesperrt (Denkmalschutz-Sponsoring aktiv).
        </p>
      ) : null}
    </Panel>
  );
}

function SponsorRewardPickForm({
  contract,
  gameId,
  roomCode,
  squad,
}: {
  contract: NonNullable<ClubOverviewSnapshot["sponsor_contract"]>;
  gameId: string;
  roomCode: string;
  squad: ClubOverviewSnapshot["squad"];
}) {
  const sortedSquad = useMemo(
    () => squad.slice().sort((a, b) => Number(b.current_stars) - Number(a.current_stars)),
    [squad],
  );
  const pickCount = contract.reward_pick_count;
  const isDualPick = pickCount > 1;

  if (isDualPick) {
    return (
      <form
        action={pickSponsorRewardPlayerAction}
        className="mt-4 space-y-3 rounded border border-emerald-800/50 bg-emerald-950/20 p-3"
      >
        <input name="game_id" type="hidden" value={gameId} />
        <input name="room_code" type="hidden" value={roomCode} />
        <input name="contract_id" type="hidden" value={contract.id} />
        <p className="text-sm font-semibold text-emerald-200">Spielerauswahl für Belohnung</p>
        <label className="block text-xs text-zinc-400">
          Spieler 1 (+ Potential)
          <select
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            name="club_player_id"
            required
          >
            <option value="">Auswählen…</option>
            {sortedSquad.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.player?.display_name ?? "Spieler"} ({Number(cp.current_stars)} Sterne)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-400">
          Spieler 2 (Max-Level)
          <select
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            name="club_player_id"
            required
          >
            <option value="">Auswählen…</option>
            {sortedSquad.map((cp) => (
              <option key={`max-${cp.id}`} value={cp.id}>
                {cp.player?.display_name ?? "Spieler"} ({Number(cp.current_stars)} Sterne)
              </option>
            ))}
          </select>
        </label>
        <Button className="w-full" type="submit">
          Belohnung anwenden
        </Button>
      </form>
    );
  }

  return (
    <form
      action={pickSponsorRewardPlayerAction}
      className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded border border-emerald-800/50 bg-emerald-950/20 p-3"
    >
      <input name="game_id" type="hidden" value={gameId} />
      <input name="room_code" type="hidden" value={roomCode} />
      <input name="contract_id" type="hidden" value={contract.id} />
      <p className="text-sm font-semibold text-emerald-200">Spieler für Belohnung wählen</p>
      {sortedSquad.map((cp) => (
        <button
          className="flex w-full items-center justify-between rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-100 hover:border-emerald-500"
          key={cp.id}
          name="club_player_id"
          type="submit"
          value={cp.id}
        >
          <span>{cp.player?.display_name ?? "Spieler"}</span>
          <span className="text-xs text-zinc-400">{Number(cp.current_stars)} Sterne</span>
        </button>
      ))}
    </form>
  );
}
