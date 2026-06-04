import Link from "next/link";
import { FlaskConical, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { getDevToolLinks, isDevEnvironment } from "@/lib/dev/dev-tools";

type DevAdminMenuProps = {
  roomCode?: string;
  /** When true, only hosts see the menu (still dev-only). */
  hostOnly?: boolean;
  isHost?: boolean;
  variant?: "panel" | "compact" | "sidebar";
  collapsed?: boolean;
};

export function DevAdminMenu({
  roomCode,
  hostOnly = false,
  isHost = true,
  variant = "panel",
  collapsed = false,
}: DevAdminMenuProps) {
  if (!isDevEnvironment()) {
    return null;
  }

  if (hostOnly && !isHost) {
    return null;
  }

  const links = getDevToolLinks({ roomCode });

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">Dev</Badge>
        {links.map((link) => (
          <Link
            key={link.href}
            className="inline-flex h-9 items-center justify-center rounded-md border border-violet-800/70 bg-violet-950/40 px-3 text-xs font-medium text-violet-100 transition hover:bg-violet-900/50"
            href={link.href}
            title={link.description}
          >
            {link.label}
          </Link>
        ))}
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className="space-y-1">
        {!collapsed ? <p className="px-2 text-xs font-medium uppercase text-violet-400/80">Dev / Admin</p> : null}
        {links.map((link) => (
          <Link
            key={link.href}
            className={`flex h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-violet-200 transition hover:bg-violet-950/50 ${
              collapsed ? "justify-center px-0" : ""
            }`}
            href={link.href}
            title={link.description}
          >
            <FlaskConical size={14} aria-hidden />
            {!collapsed ? <span className="truncate">{link.label}</span> : null}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <Panel className="border-violet-900/60 bg-zinc-950/85">
      <PanelHeader>
        <div>
          <PanelTitle className="flex items-center gap-2 text-violet-100">
            <Wrench size={18} aria-hidden />
            Dev / Admin
          </PanelTitle>
          <PanelDescription className="text-violet-200/70">
            Nur in Development sichtbar — Glossar, Labor und Testseiten.
            {roomCode ? ` Raum ${roomCode} wird im Labor vorausgefuellt.` : null}
          </PanelDescription>
        </div>
        <FlaskConical size={18} className="text-violet-300" aria-hidden />
      </PanelHeader>
      <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="block rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 transition hover:border-violet-700 hover:bg-violet-950/30"
              href={link.href}
            >
              <span className="text-sm font-medium text-zinc-50">{link.label}</span>
              <span className="mt-0.5 block text-xs text-zinc-500">{link.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
