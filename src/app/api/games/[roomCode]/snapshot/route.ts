import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { getLobbySnapshotByRoomCode } from "@/lib/lobby/data";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const view = request.nextUrl.searchParams.get("view") ?? undefined;
  const perfEnabled = process.env.GAME_PERF_LOG === "1" || process.env.NEXT_PUBLIC_GAME_PERF_LOG === "1";
  const startedAt = perfEnabled ? Date.now() : 0;
  const { snapshot, currentUserId } = await getLobbySnapshotByRoomCode(roomCode, { activeView: view });

  if (perfEnabled) {
    console.info(`[snapshot-route] room=${roomCode} view=${view ?? "dashboard"} total=${Date.now() - startedAt}ms`);
  }

  if (!snapshot) {
    notFound();
  }

  const isMember = snapshot.clubs.some((club) => club.clerk_user_id === currentUserId);
  if (!isMember) {
    return Response.json({ snapshot: null }, { status: 403 });
  }

  return Response.json({ snapshot });
}
