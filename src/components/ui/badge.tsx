import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "green" | "blue" | "amber" | "red";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-300",
  green: "border-emerald-700 bg-emerald-950 text-emerald-200",
  blue: "border-sky-700 bg-sky-950 text-sky-200",
  amber: "border-amber-700 bg-amber-950 text-amber-200",
  red: "border-rose-700 bg-rose-950 text-rose-200",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", toneClass[tone], className)}
      {...props}
    />
  );
}
