export type DevToolLink = {
  href: string;
  label: string;
  description: string;
};

export function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function getDevToolLinks(options?: { roomCode?: string }): DevToolLink[] {
  const roomCode = options?.roomCode?.trim().toUpperCase();
  const roomQuery = roomCode ? `&room=${encodeURIComponent(roomCode)}` : "";

  return [
    {
      href: "/game-changer-lab?tab=glossary",
      label: "Game Changer Glossar",
      description: "Alle Karten, Effekte und Scopes",
    },
    {
      href: `/game-changer-lab?tab=lab${roomQuery}`,
      label: "Game Changer Labor",
      description: "Dry-Run und Live-Apply auf den Club",
    },
    {
      href: "/player-db-test",
      label: "Spieler-DB",
      description: "Dynamische Karten aus Supabase",
    },
    {
      href: "/draft-test",
      label: "Draft-Test",
      description: "Lokales Draft-Board",
    },
    {
      href: "/draft-db-test",
      label: "Draft-DB-Test",
      description: "Draft mit echter Datenbank",
    },
  ];
}
