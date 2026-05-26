"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { createGameAction, joinGameAction } from "@/app/lobby/actions";
import { CLUB_TEMPLATES } from "@/lib/lobby/club-templates";
import type { ActionResult } from "@/lib/lobby/types";

type LobbyEntryFormsProps = {
  defaultSettings: {
    starting_money: number;
    max_draft_stars: number;
    turn_timeout_seconds: number;
  };
};

export function LobbyEntryForms({ defaultSettings }: LobbyEntryFormsProps) {
  const initialActionState: ActionResult = { ok: false, error: "" };
  const [createState, createFormAction, createPending] = useActionState<ActionResult, FormData>(
    createGameAction,
    initialActionState,
  );
  const [joinState, joinFormAction, joinPending] = useActionState<ActionResult, FormData>(
    joinGameAction,
    initialActionState,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Neue Runde erstellen</PanelTitle>
            <PanelDescription>Du wirst automatisch Host und kannst starten, sobald alle bereit sind.</PanelDescription>
          </div>
        </PanelHeader>
        <form action={createFormAction} className="space-y-4">
          <ClubTemplateSelect name="club_template_id" />
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Startgeld" name="starting_money" defaultValue={defaultSettings.starting_money} />
            <NumberField label="Max Draft" name="max_draft_stars" defaultValue={defaultSettings.max_draft_stars} />
            <NumberField label="Timer" name="turn_timeout_seconds" defaultValue={defaultSettings.turn_timeout_seconds} />
          </div>
          <ActionError state={createState} />
          <Button type="submit" className="w-full" disabled={createPending}>
            {createPending ? "Room wird erstellt..." : "Room erstellen"}
          </Button>
        </form>
      </Panel>

      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Room beitreten</PanelTitle>
            <PanelDescription>Gib den Code aus der Lobby ein, zum Beispiel RUW-7X.</PanelDescription>
          </div>
        </PanelHeader>
        <form action={joinFormAction} className="space-y-4">
          <label className="block text-sm font-medium text-zinc-300">
            Room-Code
            <input
              className="mt-2 h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 font-mono text-lg uppercase tracking-wide text-zinc-50 outline-none focus:border-lime-300"
              maxLength={6}
              name="room_code"
              placeholder="RUW-7X"
              required
            />
          </label>
          <ClubTemplateSelect name="club_template_id" />
          <ActionError state={joinState} />
          <Button type="submit" className="w-full" variant="secondary" disabled={joinPending}>
            {joinPending ? "Beitritt laeuft..." : "Beitreten"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function ClubTemplateSelect({ name }: { name: string }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-zinc-300">Verein</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {CLUB_TEMPLATES.map((template, index) => (
          <label
            className="group relative cursor-pointer overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 p-3 transition has-[:checked]:border-lime-300 has-[:checked]:bg-zinc-800"
            key={template.id}
          >
            <input className="peer sr-only" defaultChecked={index === 0} name={name} required type="radio" value={template.id} />
            <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: template.color }} />
            <span className="block pt-2 text-sm font-semibold text-zinc-50">{template.name}</span>
            <span className="mt-1 block text-xs text-zinc-500">{template.slogan}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ActionError({ state }: { state: ActionResult }) {
  if (state.ok || !state.error) {
    return null;
  }

  return (
    <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
      {state.error}
    </p>
  );
}

function NumberField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: number;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-300">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-zinc-50 outline-none focus:border-lime-300"
        defaultValue={defaultValue}
        min={1}
        name={name}
        type="number"
      />
    </label>
  );
}
