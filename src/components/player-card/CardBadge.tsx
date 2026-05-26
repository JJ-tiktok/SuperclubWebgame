import { getPositionLabel, type PlayerCardPosition } from "@/types/player-card";

const positionLabels: Record<PlayerCardPosition, string> = {
  ATT: "ATT",
  DEF: "DEF",
  GK: "GK",
  MID: "MID",
};

export function CardBadge({ position, positions }: { position: PlayerCardPosition; positions?: PlayerCardPosition[] }) {
  return (
    <span className="inline-flex h-7 items-center rounded-md border border-current/25 bg-black/10 px-2.5 text-xs font-black uppercase backdrop-blur">
      {positions?.length ? getPositionLabel(positions) : positionLabels[position]}
    </span>
  );
}
