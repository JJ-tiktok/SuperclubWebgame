export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

export function getSupabaseSetupHint(error: unknown) {
  const message = getErrorMessage(error, "");

  if (
    message.includes("game_saves") ||
    message.includes("save_name") ||
    message.includes("save_status") ||
    message.includes("save_version") ||
    message.includes("last_saved_at") ||
    message.includes("club_template_id") ||
    message.includes("club_slogan") ||
    message.includes("club_color") ||
    message.includes("club_templates") ||
    message.includes("Could not find")
  ) {
    return "Die Lobby-Schema-Erweiterungen fehlen. Bitte supabase/save_state_upgrade.sql im Supabase SQL Editor ausfuehren.";
  }

  if (message.includes("fetch failed") || message.includes("ENOTFOUND")) {
    return "Supabase ist nicht erreichbar. Bitte NEXT_PUBLIC_SUPABASE_URL pruefen. Sie sollte wie https://<project-ref>.supabase.co aussehen.";
  }

  return null;
}
