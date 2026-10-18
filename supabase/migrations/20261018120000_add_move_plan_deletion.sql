create or replace function public.delete_user_move_plan_generation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_plan public.user_move_plans;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into current_plan
  from public.user_move_plans
  where user_id = current_user_id
  for update;

  if not found then
    return jsonb_build_object('deleted', true, 'inProgress', false);
  end if;

  if current_plan.generation_token is not null
     and current_plan.generation_started_at > now() - interval '2 minutes' then
    return jsonb_build_object('deleted', false, 'inProgress', true);
  end if;

  delete from public.user_move_plans
  where user_id = current_user_id;

  return jsonb_build_object('deleted', true, 'inProgress', false);
end;
$$;

revoke all on function public.delete_user_move_plan_generation()
  from public, anon;
grant execute on function public.delete_user_move_plan_generation()
  to authenticated;
