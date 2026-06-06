import type { GameView } from "@/components/game/lib/dashboard-helpers";

export type ViewGuideSection = {
  id: string;
  label: string;
  description: string;
};

export type ViewGuideConfig = {
  title: string;
  summary: string;
  tips?: string[];
  sections?: ViewGuideSection[];
};

export const VIEW_GUIDES: Record<GameView, ViewGuideConfig> = {
  dashboard: {
    title: "Dashboard",
    summary:
      "Dein zentraler Spielstand: Saisonfortschritt, Finanzen auf einen Blick und der naechste Schritt. Nach Saisonende siehst du hier auch die Auswertung.",
    tips: [
      "Markiere dich als Fertig, wenn du deine Off-Season-Aufgaben erledigt hast.",
      "Der Host setzt die Phase fort, sobald alle Manager bereit sind.",
    ],
  },
  grounds: {
    title: "Vereinsgelaende",
    summary:
      "Verwalte Finanzen, Investments, Sponsoring, Personal und Game-Changer. In der Off-Season kannst du hier bis zu zwei Investitionen taetigen.",
    tips: [
      "Stadion- und Facility-Upgrades wirken auf Einnahmen und Endgame-Features.",
      "Sponsorenvertraege sind prestigebasiert und laufen ueber mehrere Saisons.",
    ],
    sections: [
      { id: "finance", label: "Finanzen", description: "Kontostand und Saisonprognose" },
      { id: "facilities", label: "Anlagen", description: "Training, Scouting, Stadion & Endgame" },
      { id: "sponsoring", label: "Sponsoring", description: "Vertraege und Praemien" },
      { id: "staff", label: "Personalmarkt", description: "Trainer & Staff-Karten" },
      { id: "game-changer", label: "Game-Changer", description: "Karten und aktive Effekte" },
    ],
  },
  squad: {
    title: "Kaderuebersicht",
    summary:
      "Sieh deinen eigenen Kader und die Teams der anderen Manager. Wechsle zwischen Clubs, um Staerken, Verletzungen und Transferoptionen zu vergleichen.",
    tips: [
      "Manager-Angebote sind in der Off-Season moeglich.",
      "Archetypes werden weiter unten im Detail erklaert.",
    ],
    sections: [
      { id: "hub", label: "Uebersicht", description: "Eigener Kader auf einen Blick" },
      { id: "archetypes", label: "Archetypes", description: "Symbol-Duelle im Angriff" },
      { id: "roster", label: "Kaderliste", description: "Spielerkarten und Angebote" },
    ],
  },
  lineup: {
    title: "Aufstellung",
    summary:
      "Stelle dein Team per Drag & Drop auf, waehle einen Captain und pruefe Gegner-Infos. Vor dem Spieltag musst du dein Lineup locken.",
    tips: [
      "Ohne eigenen Torwart wird automatisch Given (1 Stern) eingesetzt.",
      "Captain-Boost gilt nur fuer die Zone des gewaehlten Spielers.",
    ],
    sections: [
      { id: "captain", label: "Captain", description: "Boost-Spieler waehlen" },
      { id: "intel", label: "Gegner-Intel", description: "Analytics & gegnerisches Lineup" },
      { id: "board", label: "Board", description: "Spieler auf Positionen ziehen" },
    ],
  },
  matchday: {
    title: "Spieltagsuebersicht",
    summary:
      "Alle Spiele des aktuellen Spieltags. Locke dein Lineup, loese CPU-Spiele selbst und warte bei PvP auf den Host oder den Gegner.",
    tips: [
      "CPU-Spiele kannst du nach dem Locken sofort aufloesen.",
      "Geheimwaffen kannst du vor dem Match aktivieren.",
    ],
    sections: [
      { id: "overview", label: "Uebersicht", description: "Spieltag und Status" },
      { id: "fixtures", label: "Spiele", description: "Alle Begegnungen" },
      { id: "secret-weapons", label: "Geheimwaffen", description: "Match-Boni einsetzen" },
    ],
  },
  transfer: {
    title: "Transfermarkt",
    summary:
      "Kaufe Spieler aus dem Pool und verwalte Manager-zu-Manager-Angebote. Der Markt ist primaer in der Off-Season aktiv.",
    tips: [
      "Eingehende Angebote kannst du annehmen, ablehnen oder kontern.",
      "Ausgehende Angebote laufen bis zur Annahme oder zum Saisonstart.",
    ],
    sections: [
      { id: "pool", label: "Markt", description: "Verfuegbare Spieler" },
      { id: "incoming", label: "Eingehend", description: "Angebote an dich" },
      { id: "outgoing", label: "Ausgehend", description: "Deine Angebote" },
    ],
  },
  table: {
    title: "Tabelle",
    summary:
      "Liga- und Managerwertung: kosmetische Ligatabelle, Manager-Score aus Kader + Saisonpunkten sowie das Positionsboard nach Prestige.",
    tips: [
      "Manager-Rang bestimmt Praemien und Sponsoring-Optionen.",
      "Die Ligatabelle spiegelt Match-Ergebnisse der Saison wider.",
    ],
    sections: [
      { id: "positions", label: "Positionsboard", description: "Prestige-Zonen" },
      { id: "managers", label: "Managerwertung", description: "Score und Rang" },
      { id: "league", label: "Ligatabelle", description: "Spieltagspunkte" },
    ],
  },
  training: {
    title: "Training",
    summary:
      "Trainiere Spieler mit Wuerfeln in der Off-Season. Jeder Versuch kann Sterne erhoehen — begrenzt durch Trainingslevel und Kapazitaet.",
    tips: [
      "Hoehere Trainingsstufen erlauben mehr Versuche und staerkere Steigerungen.",
      "Verletzte Spieler koennen nicht trainiert werden.",
    ],
    sections: [
      { id: "center", label: "Trainingszentrum", description: "Kapazitaet und Kosten" },
      { id: "squad", label: "Kadertraining", description: "Spieler auswaehlen & wuerfeln" },
      { id: "log", label: "Protokoll", description: "Letzte Trainingsergebnisse" },
    ],
  },
  scouting: {
    title: "Scouting",
    summary:
      "Ziehe Scouting-Karten parallel zu anderen Managern, kaufe Talente oder passe. Alle Karten muessen aufgeloest sein, bevor die Phase endet.",
    tips: [
      "Scouting-Kapazitaet haengt vom Scouting-Level ab.",
      "Kaufpreise und Kaderlimit pruefen vor dem Zugreifen.",
    ],
    sections: [
      { id: "network", label: "Netzwerk", description: "Kapazitaet und Status" },
      { id: "draws", label: "Kartenziehen", description: "Neue Talente entdecken" },
      { id: "progress", label: "Fortschritt", description: "Offene Zuege aller Clubs" },
    ],
  },
  deadline: {
    title: "Deadline Day",
    summary:
      "Live-Auktionen am Deadline Day: biete auf Spieler, passe oder warte auf deinen Zug. Der Host steuert den Ablauf der Runden.",
    tips: [
      "Gebote werden auf volle Millionen gerundet.",
      "Bei Gleichstand entscheidet die Kaderstaerke.",
    ],
    sections: [
      { id: "overview", label: "Uebersicht", description: "Auktionsrunde & Budget" },
      { id: "active", label: "Aktive Auktion", description: "Gebote abgeben" },
      { id: "list", label: "Alle Auktionen", description: "Status aller Lose" },
    ],
  },
  draft: {
    title: "Draft",
    summary:
      "Waehle zu deinem Zug einen Spieler aus dem Draft-Pool. Die Reihenfolge rotiert pro Runde — baue deinen Startkader auf.",
    tips: [
      "Beachte Positionsbedarf und Chemie-Links fuer dein Start-XI.",
      "Der Draft endet nach der festgelegten Pick-Anzahl.",
    ],
    sections: [
      { id: "board", label: "Draft-Board", description: "Aktuelle Runde & Picks" },
      { id: "pool", label: "Spielerpool", description: "Verfuegbare Karten" },
      { id: "history", label: "Historie", description: "Bisherige Zuege" },
    ],
  },
  continental: {
    title: "Continental Cup",
    summary:
      "Das 32er-K.-o.-Turnier in geraden Saisons. Locke dein Lineup, spiele deine Runde und verfolge den Bracket — Praemien ab dem Halbfinale.",
    tips: [
      "Nur qualifizierte Clubs (min. Mittlerer Tabellenplatz) nehmen teil.",
      "CPU-Spiele werden automatisch simuliert, sobald deine Runde abgeschlossen ist.",
    ],
    sections: [
      { id: "status", label: "Status", description: "Runde und Praemien" },
      { id: "match", label: "Dein Spiel", description: "Lineup locken & spielen" },
      { id: "bracket", label: "Turnierbaum", description: "Alle Paarungen" },
    ],
  },
  settings: {
    title: "Einstellungen",
    summary:
      "Spielinfos, Feature-Toggles und Host-Aktionen. Nur der Host kann Lobby-Regeln aendern oder das Spiel loeschen.",
    tips: [
      "Feature-Flags gelten fuer alle Manager im Raum.",
      "Aenderungen an Toggles wirken ab der naechsten relevanten Phase.",
    ],
  },
};

export function getViewGuide(view: GameView): ViewGuideConfig {
  return VIEW_GUIDES[view];
}

export function filterVisibleSections(
  sections: ViewGuideSection[] | undefined,
  hiddenSectionIds: string[] = [],
): ViewGuideSection[] {
  if (!sections?.length) {
    return [];
  }
  const hidden = new Set(hiddenSectionIds);
  return sections.filter((section) => !hidden.has(section.id));
}
