import { Circle, Square, Triangle } from "lucide-react";
import { CardBadge } from "@/components/player-card/CardBadge";
import { ChemistryLinks } from "@/components/player-card/ChemistryLinks";
import { MarketValues } from "@/components/player-card/MarketValues";
import { SkillStars } from "@/components/player-card/SkillStars";
import { cn } from "@/lib/utils";
import { getPositionLabel, getPositionTheme, getSkillStarStates, getTotalSkillValue, type PlayerCardArchetype, type PlayerCardData } from "@/types/player-card";

type PlayerCardVariant = "draft" | "lineup";

type PlayerCardProps = {
  disabled?: boolean;
  player: PlayerCardData;
  selected?: boolean;
  showArchetypes?: boolean;
  variant?: PlayerCardVariant;
};

export function PlayerCard({ disabled = false, player, selected = false, showArchetypes = true, variant = "draft" }: PlayerCardProps) {
  const theme = getPositionTheme(player);
  const starStates = getSkillStarStates(player);

  if (variant === "lineup") {
    return <LineupPlayerCard disabled={disabled} player={player} selected={selected} showArchetypes={showArchetypes} starStates={starStates} theme={theme} />;
  }

  return <DraftPlayerCard disabled={disabled} player={player} selected={selected} showArchetypes={showArchetypes} starStates={starStates} theme={theme} />;
}

function DraftPlayerCard({
  disabled,
  player,
  selected,
  showArchetypes,
  starStates,
  theme,
}: {
  disabled: boolean;
  player: PlayerCardData;
  selected: boolean;
  showArchetypes: boolean;
  starStates: ReturnType<typeof getSkillStarStates>;
  theme: ReturnType<typeof getPositionTheme>;
}) {
  return (
    <article
      className={cn(
        "relative min-h-[148px] overflow-hidden rounded-md border p-3 shadow-sm transition",
        theme.background,
        theme.border,
        theme.text,
        selected ? "ring-2 ring-white/80" : "",
        disabled ? "opacity-45 grayscale" : "hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
      <PositionCardShape />
      <ChemistryLinks enabled={player.chemistry.left} side="left" />
      <ChemistryLinks enabled={player.chemistry.right} side="right" />
      <div className="relative z-10 flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-tight">{player.name}</p>
            <p className={cn("mt-1 truncate text-xs font-semibold", theme.muted)}>{player.role ?? getPositionLabel(player.positions)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <CardBadge position={player.position} positions={player.positions} />
            <ArchetypeBadges player={player} show={showArchetypes} />
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <SkillStars label="Skill" size="sm" states={starStates} />
          </div>
          <p className="text-right text-2xl font-black leading-none">{getTotalSkillValue(player)}</p>
        </div>

        <MarketValues compact market={player.market} />
      </div>
    </article>
  );
}

function LineupPlayerCard({
  disabled,
  player,
  selected,
  showArchetypes,
  starStates,
  theme,
}: {
  disabled: boolean;
  player: PlayerCardData;
  selected: boolean;
  showArchetypes: boolean;
  starStates: ReturnType<typeof getSkillStarStates>;
  theme: ReturnType<typeof getPositionTheme>;
}) {
  return (
    <article
      className={cn(
        "relative flex aspect-[4/5] min-h-[86px] w-full min-w-[68px] flex-col justify-between overflow-hidden rounded-md border p-2 text-center shadow-sm",
        theme.background,
        theme.border,
        theme.text,
        selected ? "ring-2 ring-white/80" : "",
        disabled ? "opacity-45 grayscale" : "",
      )}
    >
      <PositionCardShape subtle />
      <ChemistryLinks enabled={player.chemistry.left} side="left" size="sm" />
      <ChemistryLinks enabled={player.chemistry.right} side="right" size="sm" />
      <div className="relative z-10 flex items-start justify-between gap-1 text-[10px] font-black">
        <span>{getPositionLabel(player.positions)}</span>
        <span>{getTotalSkillValue(player)}</span>
      </div>
      <ArchetypeBadges compact player={player} show={showArchetypes} />
      <div className="relative z-10 min-w-0">
        <p className="truncate text-[11px] font-black leading-tight">{player.name}</p>
        <SkillStars className="mx-auto mt-1 max-w-[58px]" label="Skill" size="xs" states={starStates} wrap />
      </div>
    </article>
  );
}

function ArchetypeBadges({ compact = false, player, show }: { compact?: boolean; player: PlayerCardData; show: boolean }) {
  if (!show) return null;

  const items = [player.archetypes?.attack, player.archetypes?.defense].filter(Boolean) as PlayerCardArchetype[];

  if (items.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-1", compact ? "justify-center" : "justify-end")}>
      {items.map((archetype) => (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded border border-white/45 bg-black/20 text-white shadow-sm backdrop-blur",
            compact ? "h-4 w-4" : "h-5 min-w-5 px-1",
          )}
          key={`${archetype.role}-${archetype.key}`}
          title={`${archetype.role === "attack" ? "Angriff" : "Abwehr"}: ${archetype.label}`}
        >
          <ArchetypeIcon archetype={archetype} compact={compact} />
          {!compact ? <span className="ml-0.5 text-[8px] font-black uppercase leading-none">{archetype.role === "attack" ? "A" : "D"}</span> : null}
        </span>
      ))}
    </div>
  );
}

function ArchetypeIcon({ archetype, compact }: { archetype: PlayerCardArchetype; compact: boolean }) {
  const className = compact ? "h-2.5 w-2.5" : "h-3 w-3";

  if (archetype.symbol === "triangle") {
    return <Triangle className={className} fill="currentColor" strokeWidth={2.4} />;
  }

  if (archetype.symbol === "circle") {
    return <Circle className={className} fill="currentColor" strokeWidth={2.4} />;
  }

  return <Square className={className} fill="currentColor" strokeWidth={2.4} />;
}

function PositionCardShape({ subtle = false }: { subtle?: boolean }) {
  return (
    <>
      <div
        className={cn("pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-white", subtle ? "opacity-10" : "opacity-16")}
        style={{ clipPath: "polygon(72% 0, 100% 0, 100% 100%, 20% 100%, 56% 52%, 100% 52%, 100% 30%)" }}
      />
      <div
        className={cn("pointer-events-none absolute right-0 top-0 h-12 w-12 bg-white", subtle ? "opacity-25" : "opacity-45")}
        style={{ clipPath: "polygon(45% 0, 100% 0, 100% 55%)" }}
      />
    </>
  );
}
