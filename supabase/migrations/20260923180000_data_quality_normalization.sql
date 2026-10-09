-- Data quality fixes for backoffice analytics:
--   1. recipes.source_platform: canonical values ('Instagram' | 'Tik Tok' | null).
--   2. tags / categories: merge case/whitespace duplicates (+ a few explicit
--      category aliases), enforce case-insensitive uniqueness.
--   3. users.created_at: date -> timestamptz (keeps day, midnight in Cordoba).
--   4. palty_conversations.id_user: drop orphans, add FK with cascade.

-- ---------------------------------------------------------------------------
-- 1. source_platform
-- ---------------------------------------------------------------------------
create or replace function public.normalize_source_platform(raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(regexp_replace(coalesce(raw, ''), '[\s_\-]+', '', 'g'))
    when '' then null
    when 'instagram' then 'Instagram'
    when 'instagramreel' then 'Instagram'
    when 'instagramreels' then 'Instagram'
    when 'reel' then 'Instagram'
    when 'reels' then 'Instagram'
    when 'ig' then 'Instagram'
    when 'tiktok' then 'Tik Tok'
    else trim(raw)
  end
$$;
comment on function public.normalize_source_platform(text) is
  'Canonical source_platform label for a recipe: Instagram, Tik Tok, or the trimmed raw value.';
update public.recipes
set source_platform = public.normalize_source_platform(source_platform)
where source_platform is distinct from public.normalize_source_platform(source_platform);
-- ---------------------------------------------------------------------------
-- 2. tags / categories
-- ---------------------------------------------------------------------------
create or replace function public.normalize_taxonomy_key(raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(
    regexp_replace(
      regexp_replace(trim(coalesce(raw, '')), '\s*/\s*', '/', 'g'),
      '\s+', ' ', 'g'
    )
  )
$$;
comment on function public.normalize_taxonomy_key(text) is
  'Case/whitespace-insensitive key used to dedupe tags and categories.';
-- Explicit category aliases (plural / typo / language variants). Persisted so
-- save_recipe_full keeps folding new recipes onto the canonical category.
create table if not exists public.category_aliases (
  from_key text primary key,
  to_name  text not null
);
alter table public.category_aliases enable row level security;
revoke all on table public.category_aliases from anon, authenticated;
grant all on table public.category_aliases to service_role;
comment on table public.category_aliases is
  'normalize_taxonomy_key(name) -> canonical category name, applied by save_recipe_full.';
insert into public.category_aliases (from_key, to_name) values
  ('postres',            'Postre'),
  ('dessert',            'Postre'),
  ('plato principal',    'Plato principal'),
  ('platos principales', 'Plato principal'),
  ('prato principal',    'Plato principal'),
  ('principal',          'Plato principal'),
  ('ensaladas',          'Ensalada'),
  ('pasta',              'Pastas'),
  ('sandwiches',         'Sándwiches'),
  ('dinner',             'Cena')
on conflict (from_key) do update set to_name = excluded.to_name;
do $$
declare
  r record;
begin
  -- Categories -------------------------------------------------------------
  create temp table cat_plan as
  with base as (
    select c.id_category,
           c.name,
           coalesce(a.to_name, c.name) as target_name,
           public.normalize_taxonomy_key(coalesce(a.to_name, c.name)) as target_key,
           (select count(*) from public.recipe_categories rc where rc.id_category = c.id_category) as uses
    from public.categories c
    left join public.category_aliases a on a.from_key = public.normalize_taxonomy_key(c.name)
  )
  select id_category,
         name,
         target_name,
         target_key,
         first_value(id_category) over (
           partition by target_key
           order by (name = target_name) desc, uses desc, id_category
         ) as keep_id
  from base;

  for r in select * from cat_plan where id_category <> keep_id loop
    insert into public.recipe_categories (id_recipe, id_category)
    select rc.id_recipe, r.keep_id
    from public.recipe_categories rc
    where rc.id_category = r.id_category
    on conflict do nothing;

    delete from public.recipe_categories where id_category = r.id_category;
    delete from public.categories where id_category = r.id_category;
  end loop;

  update public.categories c
  set name = p.target_name
  from cat_plan p
  where p.id_category = c.id_category
    and p.id_category = p.keep_id
    and c.name <> p.target_name;

  -- Tags -------------------------------------------------------------------
  create temp table tag_plan as
  with base as (
    select t.id_tag,
           t.name,
           public.normalize_taxonomy_key(t.name) as target_key,
           (select count(*) from public.recipe_tags rt where rt.id_tag = t.id_tag) as uses
    from public.tags t
  )
  select id_tag,
         name,
         target_key,
         first_value(id_tag) over (
           partition by target_key
           order by uses desc, id_tag
         ) as keep_id
  from base;

  for r in select * from tag_plan where id_tag <> keep_id loop
    insert into public.recipe_tags (id_recipe, id_tag)
    select rt.id_recipe, r.keep_id
    from public.recipe_tags rt
    where rt.id_tag = r.id_tag
    on conflict do nothing;

    delete from public.recipe_tags where id_tag = r.id_tag;
    delete from public.tags where id_tag = r.id_tag;
  end loop;

  update public.tags set name = trim(name) where name <> trim(name);
  update public.categories set name = trim(name) where name <> trim(name);
end
$$;
drop table if exists cat_plan;
drop table if exists tag_plan;
create unique index if not exists tags_name_key_ci
  on public.tags (public.normalize_taxonomy_key(name));
create unique index if not exists categories_name_key_ci
  on public.categories (public.normalize_taxonomy_key(name));
-- ---------------------------------------------------------------------------
-- 3. users.created_at
-- ---------------------------------------------------------------------------
alter table public.users
  alter column created_at type timestamptz
    using (created_at::timestamp at time zone 'America/Argentina/Cordoba'),
  alter column created_at set default now();
comment on column public.users.created_at is
  'Registration instant. Rows created before 2026-09-23 only carry day precision (stored as local midnight).';
-- ---------------------------------------------------------------------------
-- 4. palty_conversations orphans
-- ---------------------------------------------------------------------------
delete from public.palty_conversations pc
where not exists (select 1 from public.users u where u.id_user = pc.id_user);
alter table public.palty_conversations
  drop constraint if exists palty_conversations_id_user_fkey;
alter table public.palty_conversations
  add constraint palty_conversations_id_user_fkey
  foreign key (id_user) references public.users (id_user) on delete cascade;
-- ---------------------------------------------------------------------------
-- 5. save_recipe_full: normalize platform, resolve tags/categories by key
-- ---------------------------------------------------------------------------
create or replace function public.save_recipe_full(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipe bigint;
  v_user   bigint := nullif(p->>'id_user_creator', '')::bigint;
begin
  if v_user is null or not exists (select 1 from users u where u.id_user = v_user) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into recipes (
    title, description, servings_default, prep_time_mins, cook_time_min,
    id_user_creator, image_path, video_source_url, difficulty,
    calories_per_serving_kcal, protein_per_serving_g, carbs_per_serving_g,
    fats_per_serving_g, fiber_per_serving_g, sugar_per_serving_g,
    sodium_per_serving_mg, source_platform, source_username, notes_on_assumptions
  ) values (
    nullif(trim(p->>'title'), ''),
    nullif(trim(p->>'description'), ''),
    nullif(p->>'servings_default', '')::int,
    nullif(p->>'prep_time_mins', '')::int,
    nullif(p->>'cook_time_min', '')::int,
    v_user,
    nullif(trim(p->>'image_path'), ''),
    nullif(trim(p->>'video_source_url'), ''),
    nullif(trim(p->>'difficulty'), ''),
    nullif(p->>'calories_per_serving_kcal', '')::numeric,
    nullif(p->>'protein_per_serving_g', '')::numeric,
    nullif(p->>'carbs_per_serving_g', '')::numeric,
    nullif(p->>'fats_per_serving_g', '')::numeric,
    nullif(p->>'fiber_per_serving_g', '')::numeric,
    nullif(p->>'sugar_per_serving_g', '')::numeric,
    nullif(p->>'sodium_per_serving_mg', '')::numeric,
    public.normalize_source_platform(p->>'source_platform'),
    nullif(trim(p->>'source_username'), ''),
    nullif(trim(p->>'notes_on_assumptions'), '')
  )
  returning id_recipe into v_recipe;

  insert into recipe_steps (id_recipe, step_number, instruction)
  select v_recipe,
         coalesce(nullif(s.elem->>'step_number', '')::int, s.ord::int),
         trim(s.elem->>'instruction')
  from jsonb_array_elements(coalesce(p->'steps', '[]'::jsonb))
       with ordinality as s(elem, ord)
  where coalesce(trim(s.elem->>'instruction'), '') <> '';

  with raw_names as (
    select coalesce(a.to_name, trim(v)) as name
    from jsonb_array_elements_text(coalesce(p->'categories', '[]'::jsonb)) v
    left join category_aliases a on a.from_key = public.normalize_taxonomy_key(v)
    where coalesce(trim(v), '') <> ''
  ),
  names as (
    select distinct on (public.normalize_taxonomy_key(name))
           name,
           public.normalize_taxonomy_key(name) as key
    from raw_names
    order by public.normalize_taxonomy_key(name), name
  ),
  ins as (
    insert into categories (name, id_user_creator)
    select n.name, v_user
    from names n
    where not exists (
      select 1 from categories c where public.normalize_taxonomy_key(c.name) = n.key
    )
    on conflict do nothing
    returning id_category, name
  ),
  resolved as (
    select coalesce(i.id_category, c.id_category) as id_category
    from names n
    left join ins i on public.normalize_taxonomy_key(i.name) = n.key
    left join categories c on public.normalize_taxonomy_key(c.name) = n.key
  )
  insert into recipe_categories (id_recipe, id_category)
  select distinct v_recipe, id_category
  from resolved
  where id_category is not null
  on conflict do nothing;

  with names as (
    select distinct on (public.normalize_taxonomy_key(v))
           trim(v) as name,
           public.normalize_taxonomy_key(v) as key
    from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) v
    where coalesce(trim(v), '') <> ''
    order by public.normalize_taxonomy_key(v), trim(v)
  ),
  ins as (
    insert into tags (name)
    select n.name
    from names n
    where not exists (
      select 1 from tags t where public.normalize_taxonomy_key(t.name) = n.key
    )
    on conflict do nothing
    returning id_tag, name
  ),
  resolved as (
    select coalesce(i.id_tag, t.id_tag) as id_tag
    from names n
    left join ins i on public.normalize_taxonomy_key(i.name) = n.key
    left join tags t on public.normalize_taxonomy_key(t.name) = n.key
  )
  insert into recipe_tags (id_recipe, id_tag)
  select distinct v_recipe, id_tag
  from resolved
  where id_tag is not null
  on conflict do nothing;

  with items as (
    select distinct on (trim(e->>'name'))
           trim(e->>'name')                                        as name,
           nullif(replace(e->>'quantity', ',', '.'), '')::numeric  as quantity,
           nullif(trim(e->>'unit'), '')                            as unit,
           nullif(trim(e->>'ingredient_size'), '')                 as ingredient_size,
           nullif(e->>'step_order', '')::int                       as step_order
    from jsonb_array_elements(coalesce(p->'ingredients', '[]'::jsonb)) e
    where coalesce(trim(e->>'name'), '') <> ''
    order by trim(e->>'name')
  ),
  ins as (
    insert into ingredients (name)
    select it.name from items it
    on conflict (name) do nothing
    returning id_ingredient, name
  ),
  resolved as (
    select coalesce(i.id_ingredient, g.id_ingredient) as id_ingredient,
           it.quantity, it.unit, it.ingredient_size, it.step_order
    from items it
    left join ins i on i.name = it.name
    left join ingredients g on g.name = it.name
  )
  insert into recipe_ingredients (id_recipe, id_ingredient, quantity, unit, ingredient_size, step_order)
  select v_recipe, id_ingredient, quantity, unit, ingredient_size, step_order
  from resolved
  where id_ingredient is not null
  on conflict (id_recipe, id_ingredient) do nothing;

  return v_recipe;
end;
$$;
revoke all on function public.save_recipe_full(jsonb) from public, anon, authenticated;
grant execute on function public.save_recipe_full(jsonb) to service_role;
