alter table public.users
  add column if not exists enabled boolean;
update public.users
set enabled = true
where enabled is null;
alter table public.users
  alter column enabled set default true,
  alter column enabled set not null;
comment on column public.users.enabled is
  'Controls whether the user may authenticate in FoodLoops.';
