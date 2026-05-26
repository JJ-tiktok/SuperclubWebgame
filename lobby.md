# Tech Architecture: Lobby, Auth & Turn Management

## 1. Authentication & User Management (Clerk)
We use **Clerk** for authentication to handle quick onboarding, user sessions, and secure user IDs without managing passwords or complex JWT setups manually.

### User Flow & Integration
- **Middleware Protection:** Unauthenticated users hitting game routes are automatically redirected to Clerk's Sign-In/Sign-Up components.
- **Database Link:** The unique `clerk_user_id` serves as the primary bridge to Supabase. When a user creates or joins a game, their Clerk metadata (`firstName`, `imageUrl`) is mirrored into the active session state.

---

## 2. Lobby System & Room Management
The lobby acts as a reactive waiting room. The entire game state lives in Supabase and is broadcasted to all connected clients instantly via **Supabase Realtime**.

### Database Schema Blueprint

#### Table: `games`
Manages the global game configuration and state machine.
- `id` (UUID, PK)
- `room_code` (TEXT, Unique) - A clean, uppercase 6-character code (e.g., "RUW-7X") for friends to join.
- `host_id` (TEXT) - Stores the `clerk_user_id` of the lobby creator (Admin).
- `status` (TEXT) - Enum states: `LOBBY`, `DRAFT`, `MANAGEMENT`, `MATCHDAY`, `FINISHED`.
- `settings` (JSONB) - Customizable parameters set by the host:
```json
  {
    "starting_money": 100000000,
    "max_draft_stars": 3,
    "turn_timeout_seconds": 60
  }