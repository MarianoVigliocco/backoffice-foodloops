-- admin_users estaba sin RLS: cualquiera con la anon key (que viaja en el
-- cliente) podia leerla y escribirla. No lleva politicas a proposito: el acceso
-- legitimo es via service_role, que las omite. admin-auth ni siquiera consulta
-- esta tabla (autoriza por la env var ADMIN_EMAILS).
alter table public.admin_users enable row level security;

-- search_path mutable: sin fijarlo, un rol puede anteponer un esquema propio y
-- secuestrar las referencias sin calificar dentro de la funcion.
alter function public.get_user_context(bigint) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;;
