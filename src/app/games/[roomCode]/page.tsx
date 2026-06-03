import { notFound, redirect } from "next/navigation";
import { GameDashboard } from "@/components/game/game-dashboard";
import { getLobbySnapshotByRoomCode } from "@/lib/lobby/data";

export const dynamic = "force-dynamic";

export default async function GameLoadPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { roomCode } = await params;
  const { view } = await searchParams;
  const { snapshot, currentUserId } = await getLobbySnapshotByRoomCode(roomCode, { activeView: view });

  if (!snapshot) {
    notFound();
  }

  const isMember = snapshot.clubs.some((club) => club.clerk_user_id === currentUserId);

  if (!isMember) {
    redirect("/lobby");
  }

  return <GameDashboard activeView={view} currentUserId={currentUserId ?? ""} snapshot={snapshot} />;
}
