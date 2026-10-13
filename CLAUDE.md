# RoadSite Reports team brief

Read this first. It applies to every person and every agent session that works on this repository.

## Goal
Simple daily site reporting for engineers on Kenyan road projects. A feature that does not serve daily reporting is frozen or removed only when both collaborators agree. Never delete one on your own.

## Who
- Owner: Laki2023
- Collaborator: kwalamei

Both agreed to these working rules on 13 October 2026.

## The code
- React (Create React App) with Supabase for sign-in and data, hosted on Vercel.
- `src/` holds the app, `public/` the page shell, and `sql/`, `supabase/migrations/` and the root `schema-*.sql` files the database history.
- Build: `npm ci`, then `npm run build`. The CI workflow (`.github/workflows/ci.yml`) runs the same build on every push to `main`.
- Supabase settings come from `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` (see `.env.example`). Set them in Vercel and in a local `.env`, never in the code.

## Working rules
1. **Pushing to `main` is allowed for both collaborators.** `main` is the live app, so every push is a release. Before every push, run `npm run build` and confirm that it passes.
2. **Never rewrite history.** No force-push, rebase or amend on `main`. Fix a mistake with a new commit or a revert.
3. **Database changes are agreed before they are applied.** A new SQL or migration file affects live data in the Supabase project. Discuss it first, then apply it.
4. **Never commit a secret.** Only the public Supabase address and anon key are used by the app. The service-role key, passwords and `.env` files stay out of the repository.
5. **Commits say who made them.** Commits made for kwalamei start their message with `[kwalamei]`.
6. **After each working session, send a short note to the other collaborator** saying what was pushed.
