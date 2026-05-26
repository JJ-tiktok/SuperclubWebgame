import { Star } from "lucide-react";
import type { StarState } from "@/types/player-card";
import { cn } from "@/lib/utils";

const starClasses: Record<StarState, string> = {
  disabled: "fill-transparent stroke-current opacity-20",
  empty: "fill-transparent stroke-current",
  filled: "fill-current stroke-current",
  veteran: "fill-black/45 stroke-black/55 text-black/55",
};

export function SkillStars({
  className,
  label,
  size = "md",
  states,
  wrap = false,
}: {
  className?: string;
  label: string;
  size?: "xs" | "sm" | "md";
  states: StarState[];
  wrap?: boolean;
}) {
  const iconSize = {
    md: "h-[18px] w-[18px]",
    sm: "h-[14px] w-[14px]",
    xs: "h-[11px] w-[11px]",
  }[size];

  return (
    <div className={className}>
      <span className="sr-only">{label}</span>
      <div
        className={cn("flex items-center justify-center gap-0.5", wrap ? "flex-wrap" : "", size === "md" ? "min-h-5" : "min-h-4")}
        aria-label={`${label}: ${states.join(", ")}`}
      >
        {states.map((state, index) => (
          <Star className={cn("shrink-0", iconSize, starClasses[state])} key={`${state}-${index}`} strokeWidth={2.2} aria-hidden />
        ))}
      </div>
    </div>
  );
}
