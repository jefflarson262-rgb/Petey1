-- PreTaskIQ pilot: database setup. Run this ONCE in Supabase (SQL Editor > New query > paste > Run).
-- It is safe to run again: nothing is deleted.

-- 1. People. One row per sign-in account. 'approved' must be true before the app lets someone in.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'foreman' check (role in ('foreman', 'safety', 'construction')),
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- 2. Saved plans (job hazard analyses). 'data' holds the full plan exactly as the app shows it.
create table if not exists public.plans (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid not null references public.profiles (id),
  owner_name       text,
  title            text not null default 'Untitled plan',
  current_revision integer not null default 1,
  data             jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists plans_created_by_idx on public.plans (created_by, updated_at desc);
create index if not exists plans_updated_idx on public.plans (updated_at desc);

-- 3. Revision history: every saved revision of every plan, kept.
create table if not exists public.plan_revisions (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  revision   integer not null,
  data       jsonb not null,
  source     text not null default 'planning' check (source in ('planning', 'petey_update', 'edit')),
  note       text,
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (plan_id, revision)
);

-- 4. A log of AI requests, used for the per-person hourly limit.
create table if not exists public.ai_usage (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  used_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, used_at desc);

-- 5. Lock the tables. Row-level security with no policies means the public (browser) key can read and write nothing.
--    Only the PreTaskIQ server functions, which use the secret key and check who is asking, can reach this data.
alter table public.profiles       enable row level security;
alter table public.plans          enable row level security;
alter table public.plan_revisions enable row level security;
alter table public.ai_usage       enable row level security;
revoke all on public.profiles, public.plans, public.plan_revisions, public.ai_usage from anon, authenticated;
grant all on public.profiles, public.plans, public.plan_revisions, public.ai_usage to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 6. When someone is added under Authentication > Users, create their profile.
--    The FIRST person ever added becomes the safety administrator and is approved automatically.
--    Everyone after that starts as an unapproved foreman until you approve them (see the setup guide).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, display_name, role, approved)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when first_user then 'safety' else 'foreman' end,
    first_user
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7. The function above is only meant to run as a trigger. Supabase's security check flags it because the public API could try to call it
--    directly; closing that costs nothing (the trigger itself keeps working).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 8. Hazard alerts (the safety inbox). When the crew flags a hazard they cannot control, the app saves an alert here; every safety
--    administrator sees it in their alerts inbox and can mark it acknowledged. Same lock as the tables above: only the server reaches it.
create table if not exists public.alerts (
  id                   uuid primary key default gen_random_uuid(),
  raised_by            uuid not null references public.profiles (id),
  raised_by_name       text,
  hazard               text not null,
  context              text,
  job                  text,
  plan_id              uuid,
  status               text not null default 'open' check (status in ('open', 'acknowledged')),
  acknowledged_by      uuid references public.profiles (id),
  acknowledged_by_name text,
  acknowledged_at      timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists alerts_status_idx on public.alerts (status, created_at desc);
create index if not exists alerts_raised_by_idx on public.alerts (raised_by, created_at desc);
alter table public.alerts enable row level security;
revoke all on public.alerts from anon, authenticated;
grant all on public.alerts to service_role;

-- 9. Knowledge base. Incident reports, root cause analyses, policies, procedures and revised drawings that Petey draws on. Shared by everyone in the company:
--    everyone signed in reads them; safety administrators add any kind, construction administrators add drawings. Removing one hides it (archived_at), it is never erased.
create table if not exists public.kb_entries (
  id              uuid primary key default gen_random_uuid(),
  kb_type         text not null check (kb_type in ('drawings', 'incident', 'rca', 'policy', 'procedure')),
  title           text not null default 'Untitled',
  data            jsonb not null,
  client_key      text,
  created_by      uuid not null references public.profiles (id),
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  archived_by     uuid references public.profiles (id)
);
create index if not exists kb_entries_live_idx on public.kb_entries (kb_type, created_at) where archived_at is null;
create unique index if not exists kb_entries_client_key_idx on public.kb_entries (created_by, client_key) where client_key is not null;
alter table public.kb_entries enable row level security;
revoke all on public.kb_entries from anon, authenticated;
grant all on public.kb_entries to service_role;

-- 9. Incident reports. A foreman files a short preliminary report; a safety administrator then completes the in-depth report (timeline,
--    evidence, witnesses, contributing factors, interim controls) that sets up the root cause analysis. Same lock as the tables above.
create table if not exists public.incident_reports (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('near_miss', 'injury', 'damage')),
  title            text not null,
  reported_by      uuid not null references public.profiles (id),
  reported_by_name text,
  reporter_role    text,
  data             jsonb not null default '{}'::jsonb,          -- the preliminary account
  full_report      jsonb,                                       -- the in-depth report (saved as it is worked on)
  status           text not null default 'preliminary' check (status in ('preliminary', 'complete')),
  due_at           timestamptz not null,
  completed_by     uuid references public.profiles (id),
  completed_by_name text,
  completed_at     timestamptz,
  kb_entry_id      uuid,
  client_key       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists incident_reports_client_key_idx on public.incident_reports (reported_by, client_key) where client_key is not null;
create index if not exists incident_reports_status_idx on public.incident_reports (status, due_at);
alter table public.incident_reports enable row level security;
revoke all on public.incident_reports from anon, authenticated;
grant all on public.incident_reports to service_role;
