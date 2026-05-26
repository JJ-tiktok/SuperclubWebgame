# Superclub Webgame

Privates, rundenbasiertes Multiplayer-Fussballmanager-Spiel im Browser. Das Projekt ist von einem Brettspielprinzip inspiriert, verwendet aber keine geschuetzten Namen, Logos, Kartenbilder oder Assets aus Vorlagen. Spieler, Vereine und Karten werden aus eigenen Daten gerendert.

## Projektziel

Superclub Webgame bildet einen kompletten Manager-Spielstand als persistentes Savegame ab: Lobby erstellen, Clubs waehlen, Spieler draften, Offseason-Aktionen ausfuehren, Deadline-Day-Auktionen spielen, Aufstellungen speichern, Spieltage simulieren und eine Tabelle fortschreiben. Die App ist fuer private Runden gedacht und kann Savegames spaeter fortsetzen.

## Tech Stack

- Next.js 16 App Router
- React 19 und TypeScript
- Tailwind CSS
- Clerk Auth
- Supabase Database und Realtime
- Server Actions als zentrale Mutationsschicht
- Node Test Runner fuer Regeltests

## Architektur

- Clerk ist die Auth-Quelle.
- Supabase speichert Lobby, Clubs, Kader, Spielphasen, Fixtures und Tabellen.
- Supabase Realtime aktualisiert nur die UI.
- Regelentscheidende Mutationen laufen serverseitig ueber Server Actions.
- `players` ist der statische Kartenkatalog.
- Spielstandsbezogene Werte wie Training, Verletzungen und Aufstellungszonen liegen in `club_players`.
- Spielerwerte in `players` werden durch Training nicht dauerhaft veraendert.

## Spielphasen

Ein neues Spiel startet mit:

1. `draft`
2. `offseason_finance`
3. `offseason_training`
4. `offseason_scouting`
5. `offseason_investments`
6. `deadline_day`
7. `prematch`
8. `match`
9. `season_end`

Ab Saison 2 startet der Loop ohne Draft wieder in der Finanzphase.

## Aktueller Funktionsumfang

- Lobby erstellen, beitreten und als Savegame fortfuehren
- feste Clubauswahl mit eigenen Logos im `public`-Ordner
- Singleplayer-Testmodus fuer Host
- dynamische Spielerkarte ohne externe Bildassets
- Draft mit 16 Spielern pro Club und serverseitigem Pick
- Vereinsgelaende mit Budget, Kaderstaerke, Training, Scouting, Stadion und Investments
- Training mit W6-Regel und saisonalem Trainingslimit
- Scouting mit Ziehen, Kaufen und Passen
- Transfermarkt v1 mit Spieler-Verkauf und Offseason-Verkaufslimit
- Deadline Day mit Auktionen, Geboten und Pass-Logik
- Aufstellung mit Drag-and-Drop, Formationen und Chemistry-Links
- Matchday mit Human- und CPU-Teams, Fixtures, CPU-Lineups, Matchsimulation und Tabelle
- Tabellenberechnung inklusive CPU-Teams

## Matchday

Die Saison wird als 6er Liga gespielt. Menschliche Clubs werden mit aktiven CPU-Teams aufgefuellt. Standard ist `five_match`, alternativ kann `double_round_robin` genutzt werden.

Die Matchauflösung nutzt drei Drittel:

- MID gegen MID
- Sieger des Mittelfelds greift mit ATT gegen DEF an
- Gegenseite greift danach mit ATT gegen DEF an

Pro Drittel zaehlen Zonensterne inklusive Chemistry-Links plus `2W6`. Drittelpunkte sind `1 / 0.5 / 0`. Tabellenpunkte sind standardmaessig `3/1/0`, optional `6/2/0`.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

Die App laeuft lokal unter:

```text
http://localhost:3000
```

Hinweis: Der Dev-Server nutzt aktuell bewusst Webpack (`next dev --webpack`), weil Turbopack in der lokalen Windows-Umgebung beim Starten von Worker-Prozessen mit `Zugriff verweigert` scheitern kann.

## Environment

Lege `.env.local` aus `.env.example` an und fuelle die Werte fuer Clerk und Supabase.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## Supabase

Das Datenbankschema liegt unter:

```text
supabase/schema.sql
```

Zusaetzliche Upgrade-Skripte liegen im `supabase/`-Ordner. Fuer Matchday und Tabelle ist insbesondere die Season-/Matchday-Erweiterung relevant, wenn eine bestehende Datenbank aktualisiert wird.

## Tests und Checks

```bash
npm test
npm run lint
npm run build
```

Der aktuelle Stand wurde mit 58 Regeltests, ESLint und Next Build verifiziert.

## Wichtige offene Themen

- Season-End-Phase finalisieren
- Finance-Phase ab Saison 2 funktional abrechnen
- Staff-System implementieren
- Game-Changer-Effekte konkretisieren
- Transferangebote zwischen Managern ergaenzen
- RLS/Realtime fuer neue Tabellen final pruefen
- Browser-Smoke fuer komplette Saison mit echtem Savegame

## Projektstatus

Das Projekt ist ein aktiver Prototyp mit spielbaren Kernflows. Die Regeln werden bewusst in kleinen, testbaren Schritten umgesetzt, damit UI, Server Actions und Datenbankzustand synchron bleiben.
