import Image from "next/image";
import { buildClubInitials } from "@/lib/lobby/custom-clubs";
import { cn } from "@/lib/utils";

const CLUB_LOGO_BY_NAME: Record<string, string> = {
  "Apex River United": "/AprexRiverUnited.png",
  "Blackwood Athletic": "/BlackwoodAthletic.png",
  "Crimson Cape FC": "/crimsonCape.png",
  "FC Dynamo Draft": "/DynamoDraft.png",
  "Golden Meadow United": "/GoldenMeadowUnited.png",
  "Vanguard FC": "/VanguardFC.png",
};

const SIZE_CLASS = {
  sm: "h-8 w-8 text-[9px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

export function getStaticClubLogoSrc(clubName: string | null | undefined) {
  return clubName ? (CLUB_LOGO_BY_NAME[clubName] ?? null) : null;
}

export function ClubBadge({
  clubName,
  clubColor,
  className,
  imageClassName,
  size = "md",
}: {
  clubName: string;
  clubColor?: string | null;
  className?: string;
  imageClassName?: string;
  size?: keyof typeof SIZE_CLASS;
}) {
  const logoSrc = getStaticClubLogoSrc(clubName);
  const color = clubColor && /^#[0-9a-fA-F]{6}$/.test(clubColor) ? clubColor : "#3f3f46";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 font-black tracking-wide text-white shadow-sm",
        SIZE_CLASS[size],
        className,
      )}
      style={logoSrc ? undefined : { backgroundColor: color }}
      title={clubName}
    >
      {logoSrc ? (
        <Image alt="" className={cn("object-contain p-1", imageClassName)} fill sizes="48px" src={logoSrc} />
      ) : (
        <span className="drop-shadow-sm">{buildClubInitials(clubName)}</span>
      )}
    </div>
  );
}
