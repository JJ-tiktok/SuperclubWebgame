# Content Packs

Keep private card data out of Git.

Use `content/private/*.private.json` locally for imported names, prices, images, staff effects, and game changer text. The app and rules engine only require generic fields:

```json
{
  "players": [
    {
      "content_key": "private-player-001",
      "display_name": "Private Name",
      "position": "MID",
      "base_stars": 3,
      "potential_stars": 1,
      "chemistry": "left",
      "scouting_price": 22000000,
      "minimum_bid": 34000000,
      "region": "Europe",
      "image_url": "/private/cards/player-001.png"
    }
  ]
}
```

## Player regions and market visibility

Scouting and Deadline Day draw only from the **market pool**:

- `visibility` must be `public` or `room`
- `region` must be one of the six scouting piles: `europe`, `africa`, `asia`, `north_america`, `south_america`, `oceania`
- Human-readable region labels in imports (for example `Europe`, `Nordamerika`) are normalized automatically

**Academy players** (`region: "academy"`) and NLZ-generated talents (`metadata.nlz_origin: true`, usually `visibility: "private"`) are **not** eligible for Scouting or Deadline Day. They are only available through the NLZ youth academy building.

For private catalog cards that should stay academy-exclusive, set `region: "academy"` and keep `visibility: "private"`.

For cards that should appear on the transfer market, assign a scouting region and set `visibility` to `public` or `room`.

A generic fallback pool of market players ships in `supabase/market_player_pool_expand.sql` (`content_key` prefix `market-pool-…`, ~90 Spieler mit realistischen Fußball-Mashup-Namen wie „Marco Haaland“ oder „Luca Mbappé“). Run that script on Supabase if the market pool feels too small.
