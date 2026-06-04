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
    case "AUCTION_PASSED":
      return applyAuctionPassed(next, event);
    case "AUCTION_CLOSED":
      return applyAuctionClosed(next, event);
    case "LINEUP_SAVED":
      return applyLineupSaved(next, event);
    case "LINEUP_LOCKED":
      return applyLineupLocked(next, event);
    case "MATCH_STARTED":
    case "MATCH_THIRD_READY_CHANGED":
    case "MATCH_THIRD_RESOLVED":
    case "MATCH_SIMULATED":
    case "DRAW_REROLL_TRIGGERED":
    case "SECRET_WEAPON_PLAYED":
      return applyFixturePatched(next, event);
    case "SCOUTING_CARD_PASSED":
      return applyScoutingCardPassed(next, event);
    case "PHASE_CHANGED":
      return applyPhaseChanged(next, event);
    case "SCOUTING_CARD_BOUGHT":
    case "SCOUTING_CARD_DRAWN":
    case "SCOUTING_STATUS_CHANGED":
    case "CLUB_SELECTED":
    case "DEADLINE_INITIALIZED":
    case "TRANSFER_OFFER_CREATED":
    case "TRANSFER_OFFER_RESOLVED":
    case "SAVE_UPDATED":
      return { applied: true, needsRefetch: true, snapshot: next };
    default:
      return { applied: false, needsRefetch: true, snapshot };
  }
}

function applyScoutingCardPassed(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const drawId = getString(event.payload.drawId);

  if (!snapshot.scouting || !drawId) {
    return { applied: true, needsRefetch: true, snapshot };
  }

  snapshot.scouting = {
    ...snapshot.scouting,
    draws: snapshot.scouting.draws.map((draw) =>
      draw.id === drawId
        ? {
            ...draw,
            resolved_at: event.created_at,
            status: "passed" as const,
          }
        : draw,
    ),
  };

  return { applied: true, needsRefetch: Boolean(event.payload.needsRefetch), snapshot };
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

function applyAuctionPassed(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const auctionId = getString(event.payload.auctionId);
  const clubId = getString(event.payload.clubId);

  if (!snapshot.deadline || !auctionId || !clubId) {
    return { applied: false, needsRefetch: true, snapshot };
  }

  const passedClubIds = getStringArray(event.payload.passedClubIds);
  const nextCurrentBidClubId = getNullableString(event.payload.nextClubId);

  snapshot.deadline = {
    ...snapshot.deadline,
    active_auction:
      snapshot.deadline.active_auction?.id === auctionId
        ? patchAuctionPass(snapshot.deadline.active_auction, event, clubId, passedClubIds, nextCurrentBidClubId)
        : snapshot.deadline.active_auction,
    auctions: snapshot.deadline.auctions.map((auction) =>
      auction.id === auctionId ? patchAuctionPass(auction, event, clubId, passedClubIds, nextCurrentBidClubId) : auction,
    ),
  };

  return { applied: true, needsRefetch: Boolean(event.payload.needsRefetch), snapshot };
}

function applyAuctionClosed(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const auctionId = getString(event.payload.auctionId);

  if (!snapshot.deadline || !auctionId) {
    return { applied: false, needsRefetch: true, snapshot };
  }

  const nextAuctionId = getNullableString(event.payload.nextAuctionId);
  const nextCurrentBidClubId = getNullableString(event.payload.nextClubId);
  const status = getString(event.payload.status);

  const patch = (auction: NonNullable<NonNullable<LobbySnapshot["deadline"]>["active_auction"]>) =>
    auction.id === auctionId
      ? {
          ...auction,
          current_bid_club_id: null,
          current_amount: getNumber(event.payload.amount) ?? auction.current_amount,
          passed_club_ids: getStringArray(event.payload.passedClubIds) ?? auction.passed_club_ids,
          resolved_at: getString(event.payload.resolvedAt) ?? auction.resolved_at,
          status: (status === "passed" || status === "resolved" ? status : auction.status) as typeof auction.status,
          turn_started_at: null,
          winning_club_id: getNullableString(event.payload.winningClubId),
        }
      : auction.id === nextAuctionId
        ? {
            ...auction,
            current_bid_club_id: nextCurrentBidClubId,
            status: "open" as const,
            turn_started_at: getNullableString(event.payload.nextTurnStartedAt),
          }
        : auction;

  const auctions = snapshot.deadline.auctions.map(patch);
  const activeAuction = nextAuctionId
    ? auctions.find((auction) => auction.id === nextAuctionId) ?? null
    : snapshot.deadline.active_auction?.id === auctionId
      ? null
      : snapshot.deadline.active_auction;

  snapshot.deadline = {
    ...snapshot.deadline,
    active_auction: activeAuction,
    auctions,
    completed_count: getNumber(event.payload.completedCount) ?? snapshot.deadline.completed_count,
  };

  return { applied: true, needsRefetch: Boolean(event.payload.needsRefetch), snapshot };
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
            away_locked_att: side === "away" ? getNestedZonePower(event.payload.powers, "ATT") ?? getNumber(event.payload.lockedAtt) ?? fixture.away_locked_att : fixture.away_locked_att,
            away_locked_def: side === "away" ? getNestedZonePower(event.payload.powers, "DEF") ?? getNumber(event.payload.lockedDef) ?? fixture.away_locked_def : fixture.away_locked_def,
            away_locked_mid: side === "away" ? getNestedZonePower(event.payload.powers, "MID") ?? getNumber(event.payload.lockedMid) ?? fixture.away_locked_mid : fixture.away_locked_mid,
            home_lineup_locked: side === "home" ? true : fixture.home_lineup_locked,
            home_locked_att: side === "home" ? getNestedZonePower(event.payload.powers, "ATT") ?? getNumber(event.payload.lockedAtt) ?? fixture.home_locked_att : fixture.home_locked_att,
            home_locked_def: side === "home" ? getNestedZonePower(event.payload.powers, "DEF") ?? getNumber(event.payload.lockedDef) ?? fixture.home_locked_def : fixture.home_locked_def,
            home_locked_mid: side === "home" ? getNestedZonePower(event.payload.powers, "MID") ?? getNumber(event.payload.lockedMid) ?? fixture.home_locked_mid : fixture.home_locked_mid,
          }
        : fixture,
    ),
  };

  return { applied: true, needsRefetch: false, snapshot };
}

function applyFixturePatched(snapshot: LobbySnapshot, event: GameEventSnapshot): GameEventApplyResult {
  const fixtureId = getString(event.payload.fixtureId);
  const fixturePatch = getRecord(event.payload.fixturePatch);

  if (!snapshot.season || !fixtureId || !fixturePatch) {
    return { applied: true, needsRefetch: true, snapshot };
  }

  snapshot.season = {
    ...snapshot.season,
    fixtures: snapshot.season.fixtures.map((fixture) =>
      fixture.id === fixtureId ? patchFixture(fixture, fixturePatch) : fixture,
    ),
  };

  return { applied: true, needsRefetch: Boolean(event.payload.needsRefetch), snapshot };
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

function patchAuctionPass(
  auction: NonNullable<NonNullable<LobbySnapshot["deadline"]>["active_auction"]>,
  event: GameEventSnapshot,
  clubId: string,
  passedClubIds: string[] | null,
  nextCurrentBidClubId: string | null,
) {
  const passBid = {
    amount: 0,
    auction_id: auction.id,
    club_id: clubId,
    created_at: event.created_at,
    id: getString(event.payload.bidId) ?? `${auction.id}:${clubId}:pass`,
    locked: true,
  };

  return {
    ...auction,
    bids: [...auction.bids.filter((item) => item.club_id !== clubId), passBid],
    current_bid_club_id: nextCurrentBidClubId,
    passed_club_ids: passedClubIds ?? [...new Set([...auction.passed_club_ids, clubId])],
    status: (getString(event.payload.status) ?? auction.status) as typeof auction.status,
    turn_started_at: getNullableString(event.payload.turnStartedAt),
  };
}

function patchFixture(
  fixture: NonNullable<LobbySnapshot["season"]>["fixtures"][number],
  patch: Record<string, unknown>,
) {
  return {
    ...fixture,
    away_lineup_locked: getBoolean(patch.away_lineup_locked) ?? fixture.away_lineup_locked,
    away_locked_att: getNullableNumber(patch.away_locked_att, fixture.away_locked_att),
    away_locked_def: getNullableNumber(patch.away_locked_def, fixture.away_locked_def),
    away_locked_mid: getNullableNumber(patch.away_locked_mid, fixture.away_locked_mid),
    away_ready_for_next_third: getBoolean(patch.away_ready_for_next_third) ?? fixture.away_ready_for_next_third,
    away_score: getNullableNumber(patch.away_score, fixture.away_score),
    away_third_points: getNullableNumber(patch.away_third_points, fixture.away_third_points),
    completed_at: getNullableString(patch.completed_at) ?? fixture.completed_at,
    current_third: getNumber(patch.current_third) ?? fixture.current_third,
    home_lineup_locked: getBoolean(patch.home_lineup_locked) ?? fixture.home_lineup_locked,
    home_locked_att: getNullableNumber(patch.home_locked_att, fixture.home_locked_att),
    home_locked_def: getNullableNumber(patch.home_locked_def, fixture.home_locked_def),
    home_locked_mid: getNullableNumber(patch.home_locked_mid, fixture.home_locked_mid),
    home_ready_for_next_third: getBoolean(patch.home_ready_for_next_third) ?? fixture.home_ready_for_next_third,
    home_score: getNullableNumber(patch.home_score, fixture.home_score),
    home_third_points: getNullableNumber(patch.home_third_points, fixture.home_third_points),
    match_state: (getString(patch.match_state) ?? fixture.match_state) as typeof fixture.match_state,
    partial_result: getRecord(patch.partial_result) ?? fixture.partial_result,
    result: getRecord(patch.result) ?? fixture.result,
    status: (getString(patch.status) ?? fixture.status) as typeof fixture.status,
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

function getNullableNumber(value: unknown, fallback: number | null | undefined) {
  if (value === null) {
    return null;
  }

  return getNumber(value) ?? fallback;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getStringArray(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

function getNestedZonePower(value: unknown, zone: "ATT" | "DEF" | "MID") {
  const record = getRecord(value);
  return record ? getNumber(record[zone]) : null;
}
