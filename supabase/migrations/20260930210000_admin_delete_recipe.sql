create or replace function public.admin_delete_recipe(p_recipe_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recipe_exists boolean;
begin
  select exists(
    select 1 from public.recipes where id_recipe = p_recipe_id
  ) into recipe_exists;

  if not recipe_exists then
    return false;
  end if;

  delete from public.palty_messages
  where conversation_id in (
    select id from public.palty_conversations where id_recipe = p_recipe_id
  );
  delete from public.palty_conversations where id_recipe = p_recipe_id;
  delete from public.meal_plan_recipes where id_recipe = p_recipe_id;
  delete from public.user_saved_recipes where recipe_id = p_recipe_id;
  delete from public.recipe_steps where id_recipe = p_recipe_id;
  delete from public.recipe_ingredients where id_recipe = p_recipe_id;
  delete from public.recipe_tags where id_recipe = p_recipe_id;
  delete from public.recipe_categories where id_recipe = p_recipe_id;
  delete from public.recipes where id_recipe = p_recipe_id;

  return true;
end;
$$;

revoke all on function public.admin_delete_recipe(bigint) from public, anon, authenticated;
grant execute on function public.admin_delete_recipe(bigint) to service_role;
