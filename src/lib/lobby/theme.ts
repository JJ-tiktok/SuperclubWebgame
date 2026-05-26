import type { LobbyClub } from "./types";

export function getClubTheme(club: Pick<LobbyClub, "club_color"> | undefined) {
  const color = club?.club_color && isHexColor(club.club_color) ? club.club_color : "#047857";
  const rgb = hexToRgb(color);
  const soft = mixHex(color, "#050609", 0.22);
  const border = mixHex(color, "#27272a", 0.62);

  return {
    color,
    rgb: `${rgb.r} ${rgb.g} ${rgb.b}`,
    soft,
    border,
  };
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function mixHex(from: string, to: string, weight: number) {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a * weight + b * (1 - weight));

  return `rgb(${mix(fromRgb.r, toRgb.r)}, ${mix(fromRgb.g, toRgb.g)}, ${mix(fromRgb.b, toRgb.b)})`;
}
