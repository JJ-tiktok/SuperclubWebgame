import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAcademyExclusivePlayer,
  isMarketPoolPlayer,
  normalizePlayerRegionKey,
  playerMatchesScoutingPile,
} from "@/lib/lobby/player-pool";

describe("player pool", () => {
  it("normalizes scouting region keys from common labels", () => {
    assert.equal(normalizePlayerRegionKey("Europe"), "europe");
    assert.equal(normalizePlayerRegionKey("Europa"), "europe");
    assert.equal(normalizePlayerRegionKey("Nordamerika"), "north_america");
    assert.equal(normalizePlayerRegionKey("south america"), "south_america");
    assert.equal(normalizePlayerRegionKey("Südamerika"), "south_america");
    assert.equal(normalizePlayerRegionKey("Ozeanien"), "oceania");
    assert.equal(normalizePlayerRegionKey("academy"), "academy");
    assert.equal(normalizePlayerRegionKey(null), "generic");
  });

  it("excludes academy, NLZ and private players from the market pool", () => {
    assert.equal(
      isAcademyExclusivePlayer({
        metadata: { nlz_origin: true },
        region: "academy",
        visibility: "private",
      }),
      true,
    );
    assert.equal(
      isAcademyExclusivePlayer({
        metadata: {},
        region: "academy",
        visibility: "public",
      }),
      true,
    );
    assert.equal(
      isAcademyExclusivePlayer({
        metadata: { nlz_origin: true },
        region: "europe",
        visibility: "public",
      }),
      true,
    );
    assert.equal(
      isAcademyExclusivePlayer({
        metadata: {},
        region: "europe",
        visibility: "private",
      }),
      true,
    );
  });

  it("keeps public and room market players eligible", () => {
    const marketPlayer = {
      metadata: {},
      region: "europe",
      visibility: "public",
    };

    assert.equal(isAcademyExclusivePlayer(marketPlayer), false);
    assert.equal(isMarketPoolPlayer(marketPlayer), true);
    assert.equal(isMarketPoolPlayer({ ...marketPlayer, visibility: "room" }), true);
    assert.equal(isMarketPoolPlayer({ ...marketPlayer, visibility: "private" }), false);
  });

  it("matches scouting draws to the selected pile", () => {
    const player = {
      metadata: {},
      region: "Europe",
      visibility: "public",
    };

    assert.equal(playerMatchesScoutingPile(player, "europe"), true);
    assert.equal(playerMatchesScoutingPile(player, "africa"), false);
    assert.equal(
      playerMatchesScoutingPile(
        { metadata: {}, region: "Nordamerika", visibility: "public" },
        "north_america",
      ),
      true,
    );
  });
});
