"use client";

import type { LucideIcon } from "lucide-react";

/**
 * Compact KPI/metric tile used on the dashboard and several sub-views.
 */
export function Metric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-zinc-50">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{detail}</p>
        </div>
        <Icon size={16} className="text-[var(--club-color)]" aria-hidden />
      </div>
    </div>
  );
}

/**
 * Small label/value pair tile for dense info grids.
 */
export function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
      <p className="font-medium uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-zinc-200">{value}</p>
    </div>
  );
}
