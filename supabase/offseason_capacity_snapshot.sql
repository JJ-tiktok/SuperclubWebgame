-- Migration: add offseason capacity snapshot columns to clubs
-- These columns are set at the START of each off_season phase and used for all
-- capacity checks during that phase, so that facility upgrades and newly
-- recruited staff members only take effect in the NEXT off-season.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS offseason_scouting_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS offseason_training_capacity INTEGER;
