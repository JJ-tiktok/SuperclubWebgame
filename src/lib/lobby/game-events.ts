import type { GameEventSnapshot, LobbySnapshot } from "@/lib/lobby/types";

export type GameEventApplyResult = {
  applied: boolean;
  needsRefetch: boolean;
  snapshot: LobbySnapshot;
};

export function applyGameEventToSnapshot(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const next = cloneSnapshot(snapshot);
  next.game.live_seq = event.seq;

  switch (event.type) {
    case "MEMBER_READY_CHANGED":
      return applyMemberReadyChanged(next, event);
    case "DRAFT_PICK_MADE":
      return applyDraftPickMade(next, event);
    case "AUCTION_BID_PLACED":
      return applyAuctionBidPlaced(next, event);
    case "LINEUP_SAVED":
      return applyLineupSaved(next, event);
    case "LINEUP_LOCKED":
      return applyLineupLocked(next, event);
    case "PHASE_CHANGED":
      return applyPhaseChanged(next, event);
    case "AUCTION_CLOSED":
    case "MATCH_SIMULATED":
    case "SCOUTING_CARD_BOUGHT":
    case "SCOUTING_CARD_DRAWN":
    case "CLUB_SELECTED":
    case "SAVE_UPDATED":
      return { applied: true, needsRefetch: true, snapshot: next };
    default:
      return { applied: false, needsRefetch: true, snapshot };
  }
}

function applyMemberReadyChanged(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const clerkUserId = getString(event.payload.clerkUserId) ?? event.actor_clerk_user_id ?? "";
  const ready = getBoolean(event.payload.ready);

  if (!clerkUserId || ready === null) {
    const phaseDone = getBoolean(event.payload.phaseDone);
    if (!clerkUserId || phaseDone === null) {
      return { applied: false, needsRefetch: true, snapshot };
    }

    snapshot.members = snapshot.members.map((member) =>
      member.clerk_user_id === clerkUserId
        ? {
            ...member,
            phase_done: phaseDone,
            phase_done_at: phaseDone ? event.created_at : null,
          }
        : member,
    );
    return { applied: true, needsRefetch: false, snapshot };
  }

  snapshot.clubs = snapshot.clubs.map((club) =>
    club.clerk_user_id === clerkUserId ? { ...club, is_ready: ready } : club,
  );

  return { applied: true, needsRefetch: Boolean(event.payload.roundComplete), snapshot };
}

function applyDraftPickMade(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  if (!snapshot.draft) {
    return { applied: true, needsRefetch: true, snapshot };
  }

  const clubId = getString(event.payload.clubId);
  const playerId = getString(event.payload.playerId);
  const pickIndex = getNumber(event.payload.pickIndex);

  if (!clubId || !playerId || pickIndex === null) {
    return { applied: false, needsRefetch: true, snapshot };
  }

  const alreadyPicked = snapshot.draft.picks.some((pick) => pick.playerId === playerId);
  const picks = alreadyPicked
    ? snapshot.draft.picks
    : [
        ...snapshot.draft.picks,
        {
          clubId,
          pickedAt: getString(event.payload.pickedAt) ?? event.created_at,
          pickIndex,
          playerId,
        },
      ];
  const nextClubId = getString(event.payload.nextClubId);

  snapshot.draft = {
    ...snapshot.draft,
    completed: getBoolean(event.payload.roundComplete) ?? snapshot.draft.completed,
    current_club_id: nextClubId,
    current_pick_index: picks.length,
    picks,
    squad_counts: {
      ...snapshot.draft.squad_counts,
      [clubId]: getNumber(event.payload.squadCount) ?? ((snapshot.draft.squad_counts[clubId] ?? 0) + 1),
    },
  };
  snapshot.game.current_turn_club_id = nextClubId;

  return { applied: true, needsRefetch: false, snapshot };
}

function applyAuctionBidPlaced(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const auctionId = getString(event.payload.auctionId);
  const clubId = getString(event.payload.clubId);
  const amount = getNumber(event.payload.amount);

  if (!snapshot.deadline || !auctionId || !clubId || amount === null) {
    return { applied: false, needsRefetch: true, snapshot };
  }

  const nextCurrentBidClubId = getNullableString(event.payload.nextClubId);
  snapshot.deadline = {
    ...snapshot.deadline,
    active_auction:
      snapshot.deadline.active_auction?.id === auctionId
        ? patchAuction(snapshot.deadline.active_auction, event, clubId, amount, nextCurrentBidClubId)
        : snapshot.deadline.active_auction,
    auctions: snapshot.deadline.auctions.map((auction) =>
      auction.id === auctionId ? patchAuction(auction, event, clubId, amount, nextCurrentBidClubId) : auction,
    ),
  };

  return { applied: true, needsRefetch: false, snapshot };
}

function applyLineupSaved(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const clubId = getString(event.payload.clubId);
  const assignments = Array.isArray(event.payload.assignments) ? event.payload.assignments : [];

  if (!clubId || snapshot.club_overview?.squad.some((player) => player.club_id === clubId) !== true) {
    return { applied: true, needsRefetch: false, snapshot };
  }

  const byId = new Map(
    assignments
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => [getString(item.clubPlayerId) ?? "", item]),
  );

  snapshot.club_overview = {
    ...snapshot.club_overview,
    squad: snapshot.club_overview.squad.map((player) => {
      const item = byId.get(player.id);
      return {
        ...player,
        current_zone: getString(item?.zone) ?? "bench",
        lineup_slot: getNumber(item?.slot),
      };
    }),
  };

  return { applied: true, needsRefetch: false, snapshot };
}

function applyLineupLocked(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const fixtureId = getString(event.payload.fixtureId);
  const side = getString(event.payload.side);

  if (!snapshot.season || !fixtureId || (side !== "home" && side !== "away")) {
    return { applied: false, needsRefetch: true, snapshot };
  }

  snapshot.season = {
    ...snapshot.season,
    fixtures: snapshot.season.fixtures.map((fixture) =>
      fixture.id === fixtureId
        ? {
            ...fixture,
            away_lineup_locked: side === "away" ? true : fixture.away_lineup_locked,
            home_lineup_locked: side === "home" ? true : fixture.home_lineup_locked,
          }
        : fixture,
    ),
  };

  return { applied: true, needsRefetch: false, snapshot };
}

function applyPhaseChanged(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const phase = getString(event.payload.phase);

  if (!phase) {
    return { applied: false, needsRefetch: true, snapshot };
  }

  snapshot.game = {
    ...snapshot.game,
    current_turn_club_id: getNullableString(event.payload.currentTurnClubId),
    phase: phase as LobbySnapshot["game"]["phase"],
  };

  return { applied: true, needsRefetch: true, snapshot };
}

function patchAuction(
  auction: NonNullable<NonNullable<LobbySnapshot["deadline"]>["active_auction"]>,
  event: GameEventSnapshot,
  clubId: string,
  amount: number,
  nextCurrentBidClubId: string | null,
) {
  const bid = {
    amount,
    auction_id: auction.id,
    club_id: clubId,
    created_at: event.created_at,
    id: getString(event.payload.bidId) ?? `${auction.id}:${clubId}`,
    locked: true,
  };
  const bids = [...auction.bids.filter((item) => item.club_id !== clubId), bid];

  return {
    ...auction,
    bids,
    current_amount: amount,
    current_bid_club_id: nextCurrentBidClubId,
    status: getString(event.payload.status) === "resolving" ? "resolving" as const : auction.status,
    turn_started_at: getNullableString(event.payload.turnStartedAt),
    winning_club_id: clubId,
  };
}

function cloneSnapshot(snapshot: LobbySnapshot): LobbySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as LobbySnapshot;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
