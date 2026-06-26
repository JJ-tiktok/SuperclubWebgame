"use client";

import { useState, useTransition } from "react";
import { selectPhilosophyAction } from "@/app/lobby/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PHILOSOPHIES, getPhilosophyById } from "@/lib/lobby/prestige";
import type { ActionResult, LobbyClub } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

export function PhilosophySelectionPanel({
  clubs,
  gameId,
  ownClub,
  onStatus,
}: {
  clubs: LobbyClub[];
  gameId: string;
  ownClub?: LobbyClub;
  onStatus: (status: ActionResult | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmPhilosophyId, setConfirmPhilosophyId] = useState<string | null>(null);
  const philosophyChosen = clubs.filter((club) => club.philosophy_id).length;
  const ownPhilosophy = ownClub?.philosophy_id ? getPhilosophyById(ownClub.philosophy_id) : null;

  function choosePhilosophy(philosophyId: string) {
    onStatus(null);
    setConfirmPhilosophyId(null);
    startTransition(async () => {
      const result = await selectPhilosophyAction(gameId, philosophyId);
      onStatus(result);
    });
  }

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle>Vereinsphilosophie</PanelTitle>
          <PanelDescription>
            Waehle dein einmaliges Langzeitziel vor dem Draft. Alle Manager sehen die Strategien der anderen.
          </PanelDescription>
        </div>
        <Badge tone={philosophyChosen === clubs.length ? "green" : "neutral"}>
          {philosophyChosen}/{clubs.length} gewaehlt
        </Badge>
      </PanelHeader>

      {ownPhilosophy ? (
        <div className="mb-4 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-4">
          <p className="text-sm font-medium text-emerald-200">Deine Philosophie: {ownPhilosophy.label}</p>
          <p className="mt-1 text-sm text-zinc-400">{ownPhilosophy.goal}</p>
          <p className="mt-2 text-xs text-emerald-400">Bonus: +{ownPhilosophy.reward} Prestige bei Erfuellung</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {PHILOSOPHIES.map((philosophy) => {
            const isConfirming = confirmPhilosophyId === philosophy.id;
            return (
              <div
                key={philosophy.id}
                className={cn(
                  "rounded-lg border p-4 transition",
                  isConfirming
                    ? "border-amber-700/60 bg-amber-950/20"
                    : "border-zinc-800 bg-zinc-900/60 hover:border-[var(--club-color)] hover:bg-zinc-900",
                  isPending && "pointer-events-none opacity-60",
                  confirmPhilosophyId && !isConfirming && "opacity-50",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-zinc-100">{philosophy.label}</p>
                  <Badge tone="blue">+{philosophy.reward}</Badge>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{philosophy.description}</p>
                <p className="mt-2 text-xs text-zinc-500">{philosophy.goal}</p>

                {!isConfirming ? (
                  <Button
                    className="mt-3 w-full"
                    disabled={isPending || Boolean(confirmPhilosophyId)}
                    onClick={() => setConfirmPhilosophyId(philosophy.id)}
                    type="button"
                    variant="secondary"
                  >
                    Waehlen
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-amber-200">
                      <span className="font-medium">{philosophy.label}</span> wirklich waehlen? Die Entscheidung ist
                      endgueltig und kann nicht geaendert werden.
                    </p>
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={isPending} onClick={() => choosePhilosophy(philosophy.id)} type="button">
                        Bestaetigen
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => setConfirmPhilosophyId(null)}
                        type="button"
                        variant="ghost"
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Strategien im Raum</p>
        {clubs.map((club) => {
          const philosophy = club.philosophy_id ? getPhilosophyById(club.philosophy_id) : null;
          return (
            <div
              key={club.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-zinc-200">{club.club_name}</p>
                <p className="text-xs text-zinc-500">{club.manager_name}</p>
              </div>
              {philosophy ? (
                <Badge tone="blue">{philosophy.label}</Badge>
              ) : (
                <Badge tone="neutral">offen</Badge>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
