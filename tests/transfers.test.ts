import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTransferOfferClosePayload,
  canAcceptTransferOffer,
  canCreateTransferOffer,
  getTransferOfferCreatorClubId,
  getTransferOfferResponderClubId,
  MANAGER_TRANSFER_DEPARTURE_LIMIT,
  normalizeTransferCashAmount,
} from "@/lib/lobby/transfers";

describe("manager transfer rules", () => {
  it("clears both swap player columns when closing offers", () => {
    const payload = buildTransferOfferClosePayload("expired", "2026-06-05T19:42:44.961Z");

    assert.equal(payload.status, "expired");
    assert.equal(payload.offered_club_player_id, null);
    assert.equal(payload.offered_player_id, null);
    assert.equal(payload.resolved_at, "2026-06-05T19:42:44.961Z");
  });

  it("allows closing offers as countered", () => {
    const payload = buildTransferOfferClosePayload("countered", "2026-06-05T19:42:44.961Z");

    assert.equal(payload.status, "countered");
    assert.equal(payload.offered_club_player_id, null);
    assert.equal(payload.offered_player_id, null);
  });

  it("resolves creator and responder with legacy fallbacks", () => {
    assert.equal(getTransferOfferCreatorClubId({ from_club_id: "buyer-a" }), "buyer-a");
    assert.equal(getTransferOfferResponderClubId({ to_club_id: "seller-a" }), "seller-a");
    assert.equal(
      getTransferOfferCreatorClubId({ created_by_club_id: "seller-a", from_club_id: "buyer-a" }),
      "seller-a",
    );
    assert.equal(
      getTransferOfferResponderClubId({ responder_club_id: "buyer-a", to_club_id: "seller-a" }),
      "buyer-a",
    );
  });

  it("normalizes cash offers to full millions", () => {
    assert.equal(normalizeTransferCashAmount(2_900_000), 2_000_000);
    assert.equal(normalizeTransferCashAmount(-1), 0);
  });

  it("allows cash-only and swap offers in the offseason", () => {
    assert.deepEqual(
      canCreateTransferOffer({
        cashAmount: 1_000_000,
        hasOfferedPlayer: false,
        isOffseason: true,
        targetOwnClub: false,
        transfersBlocked: false,
      }),
      { ok: true },
    );
    assert.deepEqual(
      canCreateTransferOffer({
        cashAmount: 0,
        hasOfferedPlayer: true,
        isOffseason: true,
        targetOwnClub: false,
        transfersBlocked: false,
      }),
      { ok: true },
    );
  });

  it("blocks empty, own-club, non-offseason, and transfer-locked offers", () => {
    assert.equal(
      canCreateTransferOffer({
        cashAmount: 0,
        hasOfferedPlayer: false,
        isOffseason: true,
        targetOwnClub: false,
        transfersBlocked: false,
      }).ok,
      false,
    );
    assert.equal(
      canCreateTransferOffer({
        cashAmount: 1_000_000,
        hasOfferedPlayer: false,
        isOffseason: true,
        targetOwnClub: true,
        transfersBlocked: false,
      }).ok,
      false,
    );
    assert.equal(
      canCreateTransferOffer({
        cashAmount: 1_000_000,
        hasOfferedPlayer: false,
        isOffseason: false,
        targetOwnClub: false,
        transfersBlocked: false,
      }).ok,
      false,
    );
    assert.equal(
      canCreateTransferOffer({
        cashAmount: 1_000_000,
        hasOfferedPlayer: false,
        isOffseason: true,
        targetOwnClub: false,
        transfersBlocked: true,
      }).ok,
      false,
    );
  });

  it("accepts valid manager transfers and applies separate departure limits", () => {
    assert.deepEqual(
      canAcceptTransferOffer({
        buyerDepartureCount: 0,
        buyerGivesPlayer: true,
        buyerMoney: 10_000_000,
        buyerSquadSize: 23,
        cashAmount: 5_000_000,
        isOffseason: true,
        sellerDepartureCount: 0,
        sellerSquadSize: 23,
        transfersBlocked: false,
      }),
      { ok: true },
    );

    assert.equal(
      canAcceptTransferOffer({
        buyerDepartureCount: 0,
        buyerGivesPlayer: false,
        buyerMoney: 10_000_000,
        buyerSquadSize: 23,
        cashAmount: 5_000_000,
        isOffseason: true,
        sellerDepartureCount: 0,
        sellerSquadSize: 20,
        transfersBlocked: false,
      }).ok,
      false,
    );

    assert.equal(
      canAcceptTransferOffer({
        buyerDepartureCount: 0,
        buyerGivesPlayer: false,
        buyerMoney: 10_000_000,
        buyerSquadSize: 20,
        cashAmount: 5_000_000,
        isOffseason: true,
        sellerDepartureCount: MANAGER_TRANSFER_DEPARTURE_LIMIT,
        sellerSquadSize: 20,
        transfersBlocked: false,
      }).ok,
      false,
    );
  });

  it("blocks acceptance by money, phase, and transfer lock", () => {
    assert.equal(
      canAcceptTransferOffer({
        buyerDepartureCount: 0,
        buyerGivesPlayer: false,
        buyerMoney: 4_000_000,
        buyerSquadSize: 20,
        cashAmount: 5_000_000,
        isOffseason: true,
        sellerDepartureCount: 0,
        sellerSquadSize: 20,
        transfersBlocked: false,
      }).ok,
      false,
    );
    assert.equal(
      canAcceptTransferOffer({
        buyerDepartureCount: 0,
        buyerGivesPlayer: false,
        buyerMoney: 10_000_000,
        buyerSquadSize: 20,
        cashAmount: 5_000_000,
        isOffseason: false,
        sellerDepartureCount: 0,
        sellerSquadSize: 20,
        transfersBlocked: false,
      }).ok,
      false,
    );
    assert.equal(
      canAcceptTransferOffer({
        buyerDepartureCount: 0,
        buyerGivesPlayer: false,
        buyerMoney: 10_000_000,
        buyerSquadSize: 20,
        cashAmount: 5_000_000,
        isOffseason: true,
        sellerDepartureCount: 0,
        sellerSquadSize: 20,
        transfersBlocked: true,
      }).ok,
      false,
    );
  });
});
