import { Binoculars, Handshake } from "lucide-react";
import { formatMarketValue, type PlayerCardData } from "@/types/player-card";
import { cn } from "@/lib/utils";

export function MarketValues({ compact = false, market }: { compact?: boolean; market: PlayerCardData["market"] }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-md border border-white/15 bg-black/14 font-black shadow-inner shadow-black/10",
        compact ? "min-h-10 text-[11px]" : "min-h-11 text-xs",
      )}
    >
      <div className={cn("flex items-center gap-2 border-r border-white/15", compact ? "px-2 py-1.5" : "px-3 py-2")}>
        <Handshake size={compact ? 14 : 16} aria-hidden />
        <span className="min-w-0">
          <span className="block leading-none">{formatMarketValue(market.transferFee, market.currency)}</span>
          <span className="mt-1 block truncate text-[9px] font-semibold uppercase opacity-65">Transfer Value</span>
        </span>
      </div>
      <div className={cn("flex items-center justify-end gap-2 text-right", compact ? "px-2 py-1.5" : "px-3 py-2")}>
        <span className="min-w-0">
          <span className="block leading-none">{formatMarketValue(market.scoutingFee, market.currency)}</span>
          <span className="mt-1 block truncate text-[9px] font-semibold uppercase opacity-65">Scouting Value</span>
        </span>
        <Binoculars size={compact ? 14 : 16} aria-hidden />
      </div>
    </div>
  );
}
