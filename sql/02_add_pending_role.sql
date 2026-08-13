-- Add 'pending' to the user_role enum (needed for signup approval flow)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'pending' BEFORE 'viewer';
