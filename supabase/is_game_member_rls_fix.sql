-- is_game_member RLS recursion fix
--
-- Problem: is_game_member (security invoker) scans game_members under RLS.
-- The game_members host-fallback policy queries games, whose policy calls
-- is_game_member again -> stack depth limit exceeded (Realtime + all RLS tables).
--
-- Fix: run as SECURITY DEFINER with a fixed search_path so the membership
-- lookup bypasses RLS while still checking only the caller's Clerk user id.

create or replace function public.is_game_member(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_members gm
    where gm.game_id = target_game_id
      and gm.clerk_user_id = public.requesting_clerk_user_id()
  );
$$;
