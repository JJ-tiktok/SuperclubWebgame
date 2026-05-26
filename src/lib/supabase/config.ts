type SupabaseConfigIssue = {
  message: string;
};

function getSupabaseUrlIssue(value: string | undefined): SupabaseConfigIssue | null {
  if (!value) {
    return { message: "NEXT_PUBLIC_SUPABASE_URL fehlt." };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { message: "NEXT_PUBLIC_SUPABASE_URL ist keine gueltige URL." };
  }

  const allowedLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  const allowedSupabaseHost = parsed.hostname.endsWith(".supabase.co");

  if (!allowedLocalHost && !allowedSupabaseHost) {
    return { message: "NEXT_PUBLIC_SUPABASE_URL muss wie https://<project-ref>.supabase.co aussehen." };
  }

  return null;
}

export function getPublicSupabaseConfigIssue(): SupabaseConfigIssue | null {
  const urlIssue = getSupabaseUrlIssue(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (urlIssue) {
    return urlIssue;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return { message: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt." };
  }

  return null;
}

export function getServiceSupabaseConfigIssue(): SupabaseConfigIssue | null {
  const publicIssue = getPublicSupabaseConfigIssue();

  if (publicIssue) {
    return publicIssue;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { message: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
  }

  return null;
}
