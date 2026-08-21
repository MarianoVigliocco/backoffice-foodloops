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
    nullif(trim(p->>'source_platform'), ''),
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

  with names as (
    select distinct trim(v) as name
    from jsonb_array_elements_text(coalesce(p->'categories', '[]'::jsonb)) v
    where coalesce(trim(v), '') <> ''
  ),
  ins as (
    insert into categories (name, id_user_creator)
    select n.name, v_user from names n
    on conflict (name) do nothing
    returning id_category, name
  ),
  resolved as (
    select coalesce(i.id_category, c.id_category) as id_category
    from names n
    left join ins i on i.name = n.name
    left join categories c on c.name = n.name
  )
  insert into recipe_categories (id_recipe, id_category)
  select distinct v_recipe, id_category
  from resolved
  where id_category is not null
  on conflict do nothing;

  with names as (
    select distinct trim(v) as name
    from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) v
    where coalesce(trim(v), '') <> ''
  ),
  ins as (
    insert into tags (name)
    select n.name from names n
    on conflict (name) do nothing
    returning id_tag, name
  ),
  resolved as (
    select coalesce(i.id_tag, t.id_tag) as id_tag
    from names n
    left join ins i on i.name = n.name
    left join tags t on t.name = n.name
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

comment on function public.save_recipe_full(jsonb) is
  'Guarda receta + pasos + categorias + tags + ingredientes atomicamente. Lanza USER_NOT_FOUND si el usuario no existe.';

revoke all on function public.save_recipe_full(jsonb) from public, anon, authenticated;
grant execute on function public.save_recipe_full(jsonb) to service_role;;
