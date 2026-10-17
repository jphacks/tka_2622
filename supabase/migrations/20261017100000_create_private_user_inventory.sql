create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  residence_type text,
  nearest_station_id text references public.stations (station_id) on delete set null,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_residence_type_check
    check (residence_type is null or residence_type in ('apartment', 'dormitory', 'sharehouse')),
  constraint user_profiles_completed_check
    check (
      not onboarding_completed
      or (residence_type is not null and nearest_station_id is not null)
    )
);

create table public.user_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null unique,
  name text,
  category text,
  condition_grade smallint,
  observations jsonb not null default '[]'::jsonb,
  recognition_result jsonb,
  recommended_action text,
  recommendation_reason text,
  selected_action text,
  analysis_status text not null default 'pending',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_items_id_user_id_key unique (id, user_id),
  constraint user_items_category_check
    check (
      category is null
      or category in (
        'furniture',
        'electronics',
        'books',
        'clothing',
        'bicycle',
        'household',
        'other'
      )
    ),
  constraint user_items_condition_grade_check
    check (condition_grade is null or condition_grade between 1 and 5),
  constraint user_items_observations_array_check
    check (jsonb_typeof(observations) = 'array'),
  constraint user_items_recommended_action_check
    check (
      recommended_action is null
      or recommended_action in ('sell', 'give', 'dispose', 'keep')
    ),
  constraint user_items_selected_action_check
    check (
      selected_action is null
      or selected_action in ('sell', 'give', 'dispose', 'keep')
    ),
  constraint user_items_analysis_status_check
    check (analysis_status in ('pending', 'processing', 'succeeded', 'failed')),
  constraint user_items_status_check
    check (status in ('pending', 'in_progress', 'completed'))
);

create table public.handling_plans (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  selected_action text not null
    check (selected_action in ('sell', 'give', 'dispose', 'keep')),
  handling_guide jsonb not null,
  service_references jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handling_plans_service_references_array_check
    check (jsonb_typeof(service_references) = 'array'),
  constraint handling_plans_one_active_per_item unique (item_id),
  constraint handling_plans_item_owner_fkey
    foreign key (item_id, user_id)
    references public.user_items (id, user_id)
    on delete cascade
);

create index user_items_user_status_created_idx
  on public.user_items (user_id, status, created_at desc);
create index user_items_user_analysis_status_idx
  on public.user_items (user_id, analysis_status);
create index handling_plans_user_saved_idx
  on public.handling_plans (user_id, saved_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_items enable row level security;
alter table public.handling_plans enable row level security;

revoke all on public.user_profiles, public.user_items, public.handling_plans
  from public, anon;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_items to authenticated;
grant select, insert, update, delete on public.handling_plans to authenticated;

create policy user_profiles_select_own
  on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_profiles_insert_own
  on public.user_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_profiles_update_own
  on public.user_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_items_select_own
  on public.user_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_items_insert_own
  on public.user_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_items_update_own
  on public.user_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy user_items_delete_own
  on public.user_items for delete to authenticated
  using (user_id = (select auth.uid()));

create policy handling_plans_select_own
  on public.handling_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy handling_plans_insert_own
  on public.handling_plans for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy handling_plans_update_own
  on public.handling_plans for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy handling_plans_delete_own
  on public.handling_plans for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.save_user_item_handling_plan(
  p_item_id uuid,
  p_selected_action text,
  p_handling_guide jsonb,
  p_service_references jsonb default '[]'::jsonb
)
returns public.handling_plans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_plan public.handling_plans;
begin
  if p_selected_action not in ('sell', 'give', 'dispose', 'keep') then
    raise exception 'INVALID_ACTION';
  end if;

  update public.user_items
  set selected_action = p_selected_action,
      status = 'in_progress',
      updated_at = now()
  where id = p_item_id
    and user_id = (select auth.uid());

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  insert into public.handling_plans (
    item_id,
    user_id,
    selected_action,
    handling_guide,
    service_references,
    saved_at,
    updated_at
  )
  values (
    p_item_id,
    (select auth.uid()),
    p_selected_action,
    p_handling_guide,
    coalesce(p_service_references, '[]'::jsonb),
    now(),
    now()
  )
  on conflict (item_id) do update
  set selected_action = excluded.selected_action,
      handling_guide = excluded.handling_guide,
      service_references = excluded.service_references,
      saved_at = now(),
      updated_at = now()
  returning * into saved_plan;

  return saved_plan;
end;
$$;

revoke all on function public.save_user_item_handling_plan(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_user_item_handling_plan(uuid, text, jsonb, jsonb)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-images',
  'item-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'item-images'
      and public
  ) then
    raise exception 'The existing item-images bucket must be private before this migration can continue.';
  end if;
end;
$$;

create policy item_images_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy item_images_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy item_images_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy item_images_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
