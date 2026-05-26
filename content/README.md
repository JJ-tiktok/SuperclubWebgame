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
