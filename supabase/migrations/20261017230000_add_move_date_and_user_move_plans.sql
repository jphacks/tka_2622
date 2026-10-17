alter table public.user_profiles
  add column if not exists moving_date date;

create table if not exists public.user_move_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  input_hash text,
  plan_data jsonb,
  generated_at timestamptz,
  generation_token uuid,
  generation_started_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_move_plans_hash_format_check
    check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),
  constraint user_move_plans_generation_state_check
    check ((generation_token is null) = (generation_started_at is null))
);

alter table public.user_move_plans enable row level security;

revoke all on public.user_move_plans from public, anon, authenticated;
grant select on public.user_move_plans to authenticated;

drop policy if exists user_move_plans_select_own
  on public.user_move_plans;

create policy user_move_plans_select_own
  on public.user_move_plans for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.claim_user_move_plan_generation(
  p_input_hash text,
  p_generation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.user_move_plans;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_input_hash is null
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_generation_token is null then
    raise exception 'INVALID_GENERATION_REQUEST';
  end if;

  insert into public.user_move_plans (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select * into current_plan
  from public.user_move_plans
  where user_id = current_user_id
  for update;

  if current_plan.input_hash = p_input_hash
     and current_plan.plan_data is not null then
    return jsonb_build_object(
      'cacheHit', true,
      'inProgress', false,
      'inputHash', current_plan.input_hash,
      'plan', current_plan.plan_data,
      'generatedAt', current_plan.generated_at
    );
  end if;

  if current_plan.generation_token is not null
     and current_plan.generation_started_at > now() - interval '2 minutes' then
    return jsonb_build_object(
      'cacheHit', false,
      'inProgress', true,
      'inputHash', current_plan.input_hash,
      'plan', current_plan.plan_data,
      'generatedAt', current_plan.generated_at
    );
  end if;

  update public.user_move_plans
  set generation_token = p_generation_token,
      generation_started_at = now(),
      updated_at = now()
  where user_id = current_user_id;

  return jsonb_build_object(
    'cacheHit', false,
    'inProgress', false,
    'inputHash', current_plan.input_hash,
    'plan', current_plan.plan_data,
    'generatedAt', current_plan.generated_at
  );
end;
$$;

create or replace function public.save_user_move_plan_generation(
  p_input_hash text,
  p_generation_token uuid,
  p_plan_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  saved_plan public.user_move_plans;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_input_hash is null
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_generation_token is null
     or p_plan_data is null
     or jsonb_typeof(p_plan_data) <> 'object' then
    raise exception 'INVALID_GENERATED_PLAN';
  end if;

  update public.user_move_plans
  set input_hash = p_input_hash,
      plan_data = p_plan_data,
      generated_at = now(),
      generation_token = null,
      generation_started_at = null,
      updated_at = now()
  where user_id = current_user_id
    and generation_token = p_generation_token
  returning * into saved_plan;

  if not found then
    raise exception 'GENERATION_CLAIM_LOST';
  end if;

  return jsonb_build_object(
    'inputHash', saved_plan.input_hash,
    'plan', saved_plan.plan_data,
    'generatedAt', saved_plan.generated_at
  );
end;
$$;

create or replace function public.release_user_move_plan_generation(
  p_generation_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.user_move_plans
  set generation_token = null,
      generation_started_at = null,
      updated_at = now()
  where user_id = (select auth.uid())
    and generation_token = p_generation_token;
end;
$$;

revoke all on function public.claim_user_move_plan_generation(text, uuid)
  from public, anon;
revoke all on function public.save_user_move_plan_generation(text, uuid, jsonb)
  from public, anon;
revoke all on function public.release_user_move_plan_generation(uuid)
  from public, anon;

grant execute on function public.claim_user_move_plan_generation(text, uuid)
  to authenticated;
grant execute on function public.save_user_move_plan_generation(text, uuid, jsonb)
  to authenticated;
grant execute on function public.release_user_move_plan_generation(uuid)
  to authenticated;
