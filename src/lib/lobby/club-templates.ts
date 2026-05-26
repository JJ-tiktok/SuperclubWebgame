import type { ClubTemplate } from "./types";

export const CLUB_TEMPLATES = [
  {
    id: "vanguard",
    name: "Vanguard FC",
    slogan: "From Assets to Icons.",
    color: "#0f172a",
    tailwind: "slate-900",
    vibe: "Cleaner, korporativer Look fuer kuehle Strategie, Struktur und Professionalitaet.",
  },
  {
    id: "golden_meadow",
    name: "Golden Meadow United",
    slogan: "Where Talents Turn into Stars.",
    color: "#047857",
    tailwind: "emerald-700",
    vibe: "Sattes Akademie-Gruen fuer Ausbildung, Entwicklung und junge Toptalente.",
  },
  {
    id: "apex_river",
    name: "Apex River United",
    slogan: "The Perfect Chemistry.",
    color: "#0f766e",
    tailwind: "teal-700",
    vibe: "Moderne, fliessende Synergie-Farbe fuer perfekte Kaderchemie.",
  },
  {
    id: "dynamo_draft",
    name: "FC Dynamo Draft",
    slogan: "Calculated Chaos, Maximum Yield.",
    color: "#d97706",
    tailwind: "amber-600",
    vibe: "Aggressiver Markt- und Auktionsclub mit lautem, dynamischem Auftritt.",
  },
  {
    id: "blackwood",
    name: "Blackwood Athletic",
    slogan: "Built on Solid Ground.",
    color: "#27272a",
    tailwind: "zinc-800",
    vibe: "Dunkel, edel und unnachgiebig mit Stadion- und Traditionsfokus.",
  },
  {
    id: "crimson_cape",
    name: "Crimson Cape FC",
    slogan: "Fortune Favors the Bold.",
    color: "#be123c",
    tailwind: "rose-700",
    vibe: "Leidenschaft, Risiko und Wuerfelmagie in tiefem Karmesinrot.",
  },
] satisfies ClubTemplate[];

export function getClubTemplate(templateId: string | null | undefined) {
  return CLUB_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function validateClubTemplateId(templateId: string | null | undefined) {
  const template = getClubTemplate(templateId);

  if (!template) {
    return { ok: false, error: "Bitte waehle einen verfuegbaren Verein aus." } as const;
  }

  return { ok: true, template } as const;
}
