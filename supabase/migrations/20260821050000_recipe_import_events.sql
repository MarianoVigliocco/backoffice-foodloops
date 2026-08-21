create table if not exists public.recipe_import_events (
  id uuid primary key default gen_random_uuid(),
  id_user bigint references public.users(id_user) on delete set null,
  platform text not null check (platform in ('Instagram', 'TikTok')),
  status text not null default 'started'
    check (status in ('started', 'succeeded', 'failed')),
  error_code text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists recipe_import_events_created_at_idx
  on public.recipe_import_events (created_at desc);

create index if not exists recipe_import_events_user_created_idx
  on public.recipe_import_events (id_user, created_at desc);

alter table public.recipe_import_events enable row level security;
revoke all on table public.recipe_import_events from anon, authenticated;
grant all on table public.recipe_import_events to service_role;

comment on table public.recipe_import_events is
  'Operational analytics for Instagram and TikTok recipe extraction attempts.';
