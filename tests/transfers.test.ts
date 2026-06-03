import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAcceptTransferOffer,
  canCreateTransferOffer,
  MANAGER_TRANSFER_DEPARTURE_LIMIT,
  normalizeTransferCashAmount,
} from "@/lib/lobby/transfers";

describe("manager transfer rules", () => {
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
