-- V3c Fix: Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profession text;
