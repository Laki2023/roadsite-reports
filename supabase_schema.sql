-- ROADSITE REPORTS - SUPABASE SETUP (v2, recursion-safe)

-- 1. PROFILES
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null,
  role text not null default 'pending' check (role in ('pending','re','engineer','admin')),
  phone text,
  created_at timestamptz default now(),
  approved_at timestamptz
);

-- 2. PROJECTS
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  contract_number text,
  status text default 'active' check (status in ('active','completed','suspended')),
  progress_pct integer default 0 check (progress_pct between 0 and 100),
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

-- 3. DAILY REPORTS
create table public.daily_reports (
  id uuid default gen_random_uuid() primary key,
  submitted_by uuid references public.profiles(id) not null,
  project_id uuid references public.projects(id) not null,
  report_date date not null default current_date,
  chainage text,
  work_done text not null,
  labour_count integer default 0,
  equipment text,
  weather text,
  progress_pct integer check (progress_pct between 0 and 100),
  observations text,
  challenges text,
  is_urgent boolean default false,
  urgent_description text,
  urgent_category text,
  tomorrow_plan text,
  status text default 'submitted' check (status in ('submitted','reviewed','actioned')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  engineer_notes text,
  created_at timestamptz default now()
);

-- 4. HELPER: current user's role (security definer avoids RLS recursion)
create or replace function public.get_my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 5. ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.daily_reports enable row level security;

-- Profiles
create policy "view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "staff view all profiles" on public.profiles
  for select using (public.get_my_role() in ('admin','engineer'));
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "admin update any profile" on public.profiles
  for update using (public.get_my_role() = 'admin');
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Projects
create policy "approved users view projects" on public.projects
  for select using (public.get_my_role() in ('re','engineer','admin'));
create policy "staff manage projects" on public.projects
  for all using (public.get_my_role() in ('admin','engineer'));

-- Reports
create policy "re views own reports" on public.daily_reports
  for select using (auth.uid() = submitted_by);
create policy "staff view all reports" on public.daily_reports
  for select using (public.get_my_role() in ('admin','engineer'));
create policy "approved users submit reports" on public.daily_reports
  for insert with check (
    auth.uid() = submitted_by and public.get_my_role() in ('re','engineer','admin')
  );
create policy "staff update reports" on public.daily_reports
  for update using (public.get_my_role() in ('admin','engineer'));

-- 6. AUTO-CREATE PROFILE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name','New User'),
    new.email,
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. SAMPLE PROJECTS
insert into public.projects (name, contract_number, progress_pct) values
  ('A104 Thika - Kenol Road', 'KRB/2023/041', 68),
  ('B7 Eldoret Bypass', 'KRB/2023/088', 41),
  ('C55 Naivasha - Nakuru Road', 'KRB/2024/012', 55),
  ('D12 Mombasa Road Rehabilitation', 'KRB/2023/099', 82),
  ('E22 Kisumu Ring Road', 'KRB/2024/003', 23);
