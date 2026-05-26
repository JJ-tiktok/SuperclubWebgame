# Project: Superclub Webapp (Private Edition)

## 1. Project Overview & Goal
The goal of this project is to build a web-based, turn-based football manager board game closely inspired by "Superclub". It is designed for private multiplayer sessions among friends. The UI should feel like a modern, responsive sports dashboard (built with Tailwind CSS), avoiding heavy 3D or manual physics physics. Instead, it relies on strict reactive data states.

### Core Tech Stack
- **Frontend:** Next.js (App Router), Tailwind CSS, shadcn/ui (for clean dashboard components)
- **Backend/Realtime:** Supabase (Database, Auth, and Realtime Subscriptions for live multiplayer state)
- **State Management:** React Context or Zustand for local UI state, synced with Supabase Realtime.

---

## 2. Legal & Architectural Safety (No IP Infringement)
To ensure zero copyright issues, the codebase must be entirely content-agnostic.
- **Code:** All logic uses generic terms (`player`, `scouting_level`, `stadium_level`, `stars`, `finance`).
- **Data Layer:** The actual game content (real names, clubs, card images) is stored in a separate, git-ignored JSON configuration file or injected privately into the database. The app simply renders whatever data it is fed.

---

## 3. Game Phases & Core Logic

### Phase 0: Game Setup & Initialization
- **Lobby System:** A host creates a game room. Friends join via a unique room code.
- **Draft Settings:** Before starting, the host configures the initial draft rules:
  - Max player quality for the draft (e.g., "No players with > 3 stars allowed").
  - Starting budget per club (Default: 100M).

### Phase 1: The Initial Draft
- **Objective:** Every club must draft a default squad of exactly 16 players.
- **Mechanic:** Turn-based snake draft (Player 1 -> 2 -> 3 -> 4 -> 4 -> 3 -> 2 -> 1).
- **Pool:** A filtered list of players matching the draft settings.
- **UI:** A clear "Draft Board" showing available players, whose turn it is, and a countdown timer.

### Phase 2: Club Infrastructure Management
Every user has a personal dashboard managing three main club assets, upgradeable in levels (1 to 3+):
1. **Training Ground:** Higher levels unlock development slots or boost the success rate of training players to the next star rating.
2. **Scouting Network:** Higher levels allow drawing more or better player cards from the main deck during the off-season/transfer phase.
3. **Stadium:** Higher levels generate more passive income during home matches.

### Phase 3: The Transfer Market & Scouting
- **Scouting:** Players can spend money to reveal new cards from the main player pool based on their Scouting Network level.
- **Bidding War:** 
  - A player card is put up for auction.
  - **Secret Bidding:** Every user types their bid into a hidden input field.
  - **Resolution:** Supabase evaluates the inputs simultaneously. The highest bidder gets the card, the money is deducted.

### Phase 4: Tactical Setup & Squad Building
- Users assign their 16 players to the pitch into 3 main zones: **Defense**, **Midfield**, and **Attack**.
- **Team Chemistry:** Matching specific player attributes/types in the same zone provides a synergy bonus, increasing the total star rating of that zone.

### Phase 5: Match Day & Resolution
- **Matchup:** Two clubs face each other. 
- **Calculation:** Zone vs. Zone comparisons (e.g., Attack vs. Defense). 
- **The Core Dice Mechanic:** 
  - Total Zone Power = Base Zone Stars + Synergy Bonus + Simulated Die Roll (1-6).
  - The die roll introduces the unpredictable "football magic".
- **Outcome:** Updates league standings, awards points, and pays out stadium revenue based on match outcomes (Win/Draw/Loss).

---

## 4. Database Schema (Supabase Blueprint)

### `games`
- `id` (UUID, PK)
- `room_code` (TEXT)
- `status` (TEXT: 'lobby', 'draft', 'season', 'completed')
- `settings` (JSONB: { max_draft_stars: 3, starting_money: 100000000 })
- `current_turn_player_id` (UUID)

### `clubs`
- `id` (UUID, PK)
- `game_id` (UUID, FK)
- `user_id` (UUID)
- `club_name` (TEXT)
- `money` (BIGINT)
- `points` (INT)
- `stadium_level` (INT)
- `scouting_level` (INT)
- `training_level` (INT)

### `players_pool` (The Master List, content-agnostic)
- `id` (UUID, PK)
- `name` (TEXT)
- `position` (TEXT: 'DEF', 'MID', 'ATT')
- `base_stars` (INT)
- `potential_stars` (INT)
- `synergy_type` (TEXT)

### `club_players` (Junction table for squad ownership)
- `id` (UUID, PK)
- `club_id` (UUID, FK)
- `player_id` (UUID, FK)
- `current_zone` (TEXT: 'bench', 'DEF', 'MID', 'ATT')

---

## 5. Phased Implementation Roadmap for Vibe Coding

### Milestone 1: The Draft Engine (MVP Start)
- [ ] Setup Supabase schema for games, clubs, and players.
- [ ] Build the lobby screen with host settings (Max stars restriction).
- [ ] Implement the turn-based Snake Draft logic utilizing Supabase Realtime subscriptions so picks update instantly across all screens.
- [ ] Enforce the 16-player squad limit.

### Milestone 2: The Club Dashboard & Infrastructure
- [ ] Build the main manager UI with tabs for "Squad", "Club Grounds", and "League Table".
- [ ] Implement infrastructure upgrade logic (deducting money, increasing levels).

### Milestone 3: Transfer Market & Secret Bidding
- [ ] Implement the scouting card draw mechanic.
- [ ] Build the real-time auction house where bids remain hidden until all players locked them in.

### Milestone 4: Match Day Logic
- [ ] Add tactical placement (moving players to DEF/MID/ATT).
- [ ] Implement the dice roll simulation and zone comparison algorithm.
- [ ] Automate financial payouts and point tracking.