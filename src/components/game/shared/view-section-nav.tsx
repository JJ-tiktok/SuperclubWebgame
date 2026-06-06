"use client";

import Link from "next/link";
import type { ViewGuideSection } from "@/components/game/lib/view-guides";
import { cn } from "@/lib/utils";

export function ViewSectionNav({
  className,
  sections,
}: {
  className?: string;
  sections: ViewGuideSection[];
}) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)}>
      {sections.map((section) => (
        <Link
          className="min-w-[9.5rem] shrink-0 rounded-md border border-zinc-800 bg-zinc-950/70 p-3 transition hover:border-zinc-600 hover:bg-zinc-900/80"
          href={`#${section.id}`}
          key={section.id}
        >
          <p className="text-sm font-semibold text-zinc-100">{section.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{section.description}</p>
        </Link>
      ))}
    </div>
  );
}
