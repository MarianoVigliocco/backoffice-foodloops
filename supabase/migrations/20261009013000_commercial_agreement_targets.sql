alter table public.commercial_agreements
  add column if not exists target_reached_users bigint,
  add column if not exists target_saves bigint;

alter table public.commercial_agreements
  drop constraint if exists commercial_agreements_target_reached_users_check,
  add constraint commercial_agreements_target_reached_users_check
    check (target_reached_users is null or target_reached_users >= 0),
  drop constraint if exists commercial_agreements_target_saves_check,
  add constraint commercial_agreements_target_saves_check
    check (target_saves is null or target_saves >= 0);

comment on column public.commercial_agreements.target_reached_users is
  'Optional agreed target for unique users who save attributed recipes.';
comment on column public.commercial_agreements.target_saves is
  'Optional agreed target for total saves of attributed recipes.';

