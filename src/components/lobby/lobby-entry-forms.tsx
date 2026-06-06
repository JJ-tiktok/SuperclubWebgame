"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { createGameAction, joinGameAction } from "@/app/lobby/actions";
import { ClubBadge } from "@/components/game/club-badge";
import { CLUB_TEMPLATES } from "@/lib/lobby/club-templates";
import { CUSTOM_CLUB_COLOR_SWATCHES, CUSTOM_CLUB_TEMPLATE_VALUE } from "@/lib/lobby/custom-clubs";
import { CPU_TIER_LABEL, getMinCpuTeamsForLobby, type CpuTeamCatalogRow } from "@/lib/lobby/cpu-teams";
import type { CpuStrengthTier } from "@/lib/lobby/types";
import type { ActionResult } from "@/lib/lobby/types";

type LobbyEntryFormsProps = {
  defaultSettings: {
    starting_money: number;
    max_draft_stars: number;
    turn_timeout_seconds: number;
    continental_cup_enabled?: boolean;
    sponsoring_enabled?: boolean;
    archetypes_enabled?: boolean;
  };
  cpuTeams: CpuTeamCatalogRow[];
};

export function LobbyEntryForms({ defaultSettings, cpuTeams }: LobbyEntryFormsProps) {
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
          <ClubSelection name="club_template_id" />
          <CpuTeamSelect teams={cpuTeams} />
          <div className="grid gap-3 md:grid-cols-3">
            <BooleanSettingToggle
              defaultEnabled={defaultSettings.continental_cup_enabled ?? true}
              description="Nach geraden Saisons ab Saison 2 ein K.o.-Turnier."
              disabledDescription="Aus: nach Saisonende direkt in die naechste Off-Season."
              label="Continental Cup"
              name="continental_cup_enabled"
            />
            <BooleanSettingToggle
              defaultEnabled={defaultSettings.sponsoring_enabled ?? true}
              description="Sponsorenvertraege, Ziele und Sponsoren-Effekte aktivieren."
              disabledDescription="Aus: Sponsoring wird im Spiel ausgeblendet und ignoriert."
              label="Sponsoring"
              name="sponsoring_enabled"
            />
            <BooleanSettingToggle
              defaultEnabled={defaultSettings.archetypes_enabled ?? true}
              description="Archetype-Duelle im Angriffsdrittel aktivieren."
              disabledDescription="Aus: Archetypes bleiben neutral und geben keine Boni/Mali."
              label="Archetypes"
              name="archetypes_enabled"
            />
          </div>
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
          <ClubSelection name="club_template_id" />
          <ActionError state={joinState} />
          <Button type="submit" className="w-full" variant="secondary" disabled={joinPending}>
            {joinPending ? "Beitritt laeuft..." : "Beitreten"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function BooleanSettingToggle({
  defaultEnabled,
  description,
  disabledDescription,
  label,
  name,
}: {
  defaultEnabled: boolean;
  description: string;
  disabledDescription: string;
  label: string;
  name: string;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);

  return (
    <fieldset className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
      <legend className="px-1 text-sm font-medium text-zinc-300">{label}</legend>
      <input name={name} type="hidden" value={enabled ? "1" : "0"} />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          checked={enabled}
          className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-lime-400 focus:ring-lime-300"
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        <span className="text-sm text-zinc-300">
          {description}
          <span className="mt-1 block text-xs text-zinc-500">
            {disabledDescription}
          </span>
        </span>
      </label>
    </fieldset>
  );
}

function CpuTeamSelect({ teams }: { teams: CpuTeamCatalogRow[] }) {
  const minRequired = getMinCpuTeamsForLobby(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(teams.map((team) => team.id)));
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectionOk = selected.size >= minRequired;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-zinc-300">
        CPU-Gegner ({selected.size} gewaehlt, min. {minRequired})
      </legend>
      <p className="text-xs text-zinc-500">
        Waehle die Mannschaften fuer die Liga. Beim Saisonstart werden so viele Teams eingebunden, wie fuer die Spieleranzahl noetig sind (Reihenfolge = deine Auswahl).
      </p>
      <input name="cpu_team_ids" type="hidden" value={JSON.stringify(selectedIds)} />
      <div className="grid gap-2 sm:grid-cols-2">
        {teams.map((team) => {
          const checked = selected.has(team.id);
          return (
            <label
              className={`group relative cursor-pointer overflow-hidden rounded-md border p-3 transition ${
                checked ? "border-lime-300 bg-zinc-800" : "border-zinc-800 bg-zinc-900"
              }`}
              key={team.id}
            >
              <input
                checked={checked}
                className="peer sr-only"
                onChange={() => toggle(team.id)}
                type="checkbox"
              />
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: team.color }} />
              <div className="flex items-start justify-between gap-2 pt-2">
                <span className="text-sm font-semibold text-zinc-50">{team.display_name}</span>
                <CpuTierBadge tier={team.strength_tier} />
              </div>
            </label>
          );
        })}
      </div>
      {!selectionOk ? (
        <p className="text-xs text-amber-300" role="status">
          Mindestens {minRequired} CPU-Mannschaften auswaehlen (6er-Liga mit einem Manager).
        </p>
      ) : null}
    </fieldset>
  );
}

function CpuTierBadge({ tier }: { tier: CpuStrengthTier }) {
  const tone =
    tier === "stark" ? "border-rose-500/50 bg-rose-950/80 text-rose-200" : tier === "mittel" ? "border-amber-500/50 bg-amber-950/80 text-amber-200" : "border-zinc-600 bg-zinc-800 text-zinc-300";
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>
      {CPU_TIER_LABEL[tier]}
    </span>
  );
}

function ClubSelection({ name }: { name: string }) {
  const defaultTemplateId = CLUB_TEMPLATES[0]?.id ?? "";
  const [selected, setSelected] = useState(defaultTemplateId);
  const [customClubName, setCustomClubName] = useState("");
  const [customClubColor, setCustomClubColor] = useState<string>(CUSTOM_CLUB_COLOR_SWATCHES[0]);
  const customSelected = selected === CUSTOM_CLUB_TEMPLATE_VALUE;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-zinc-300">Verein</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {CLUB_TEMPLATES.map((template) => (
          <label
            className="group relative cursor-pointer overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 p-3 transition has-[:checked]:border-lime-300 has-[:checked]:bg-zinc-800"
            key={template.id}
          >
            <input
              checked={selected === template.id}
              className="peer sr-only"
              name={name}
              onChange={() => setSelected(template.id)}
              required
              type="radio"
              value={template.id}
            />
            <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: template.color }} />
            <span className="block pt-2 text-sm font-semibold text-zinc-50">{template.name}</span>
            <span className="mt-1 block text-xs text-zinc-500">{template.slogan}</span>
          </label>
        ))}
        <label className="group relative cursor-pointer overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 p-3 transition has-[:checked]:border-lime-300 has-[:checked]:bg-zinc-800">
          <input
            checked={customSelected}
            className="peer sr-only"
            name={name}
            onChange={() => setSelected(CUSTOM_CLUB_TEMPLATE_VALUE)}
            required
            type="radio"
            value={CUSTOM_CLUB_TEMPLATE_VALUE}
          />
          <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: customClubColor }} />
          <span className="flex items-center gap-2 pt-2">
            <ClubBadge clubColor={customClubColor} clubName={customClubName || "Eigener Club"} size="sm" />
            <span>
              <span className="block text-sm font-semibold text-zinc-50">Eigener Club</span>
              <span className="mt-1 block text-xs text-zinc-500">Name und Farbe selbst festlegen.</span>
            </span>
          </span>
        </label>
      </div>
      {customSelected ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_170px]">
            <label className="block text-sm font-medium text-zinc-300">
              Clubname
              <input
                className="mt-2 h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-zinc-50 outline-none focus:border-lime-300"
                maxLength={40}
                name="custom_club_name"
                onChange={(event) => setCustomClubName(event.target.value)}
                placeholder="z. B. Nordstadt FC"
                required={customSelected}
                value={customClubName}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-300">
              Hex-Farbe
              <input
                className="mt-2 h-11 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 font-mono text-zinc-50 outline-none focus:border-lime-300"
                name="custom_club_color"
                onChange={(event) => setCustomClubColor(event.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                required={customSelected}
                value={customClubColor}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Clubfarbe waehlen">
            {CUSTOM_CLUB_COLOR_SWATCHES.map((color) => (
              <button
                aria-label={`Clubfarbe ${color}`}
                className={`h-8 w-8 rounded-full border transition ${
                  customClubColor.toUpperCase() === color ? "border-lime-300 ring-2 ring-lime-300/30" : "border-zinc-700"
                }`}
                key={color}
                onClick={() => setCustomClubColor(color)}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
          </div>
        </div>
      ) : null}
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
