import { redirect } from "next/navigation";

export default async function GameLobbyRedirectPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;

  redirect(`/games/${roomCode}`);
}
