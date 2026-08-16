-- ═══════════════════════════════════════════════════════════════
-- V15.7 Migration: Project Officer role + Position Templates
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → paste → Run)
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add project_officer to user_role enum
-- (Must be a separate statement from the rest)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_officer';

