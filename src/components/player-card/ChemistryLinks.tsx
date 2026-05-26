import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type ChemistryLinksProps = {
  enabled: boolean;
  side: "left" | "right";
  size?: "sm" | "md";
};

export function ChemistryLinks({ enabled, side, size = "md" }: ChemistryLinksProps) {
  if (!enabled) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 items-center justify-center rounded-full border border-yellow-100/70 bg-yellow-400 text-yellow-950 shadow-[0_0_18px_rgba(250,204,21,0.75)]",
        side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
        size === "sm" ? "h-6 w-4" : "h-8 w-5",
      )}
      aria-label={`${side} chemistry link`}
    >
      <HalfStar side={side} size={size} />
    </div>
  );
}

function HalfStar({ side, size }: { side: "left" | "right"; size: "sm" | "md" }) {
  return (
    <span className={cn("relative block overflow-hidden text-current drop-shadow-sm", size === "sm" ? "h-[18px] w-2.5" : "h-[24px] w-3.5")}>
      <Star
        className={cn(
          "absolute top-0 fill-current stroke-current",
          size === "sm" ? "h-[18px] w-[18px]" : "h-[24px] w-[24px]",
          side === "left" ? "left-0" : "right-0",
        )}
        strokeWidth={2.2}
        aria-hidden
      />
    </span>
  );
}
