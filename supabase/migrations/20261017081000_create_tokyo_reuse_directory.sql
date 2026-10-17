create table public.stations (
  station_id text primary key,
  station_group_code text not null,
  source_station_codes text not null,
  station_names text not null,
  station_name text not null,
  operators text not null,
  lines text not null,
  latitude double precision not null,
  longitude double precision not null,
  coordinate_method text not null,
  coordinate_source text not null,
  source_id text not null,
  constraint stations_latitude_range check (latitude between -90 and 90),
  constraint stations_longitude_range check (longitude between -180 and 180)
);

create table public.businesses (
  business_id text primary key,
  source_business_code text,
  name text not null,
  name_kana text,
  business_category text,
  municipality_code text,
  prefecture text,
  municipality text,
  address text not null,
  address_detail text,
  latitude double precision,
  longitude double precision,
  coordinate_status text not null,
  phone text,
  website_url text,
  purchase_status text not null,
  sales_status text,
  service_type_status text,
  service_type_evidence text,
  products_handled_source_text text,
  buyback_criteria_source_text text,
  opening_days text,
  weekday_open text,
  weekday_close text,
  holiday_open text,
  holiday_close text,
  hours_notes text,
  usage_notes text,
  source_id text not null,
  source_url text,
  source_license text,
  validation_status text not null,
  source_record_json jsonb,
  constraint businesses_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint businesses_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  constraint businesses_coordinates_pair check (
    (latitude is null) = (longitude is null)
  )
);

create table public.station_businesses (
  station_id text not null references public.stations (station_id) on delete cascade,
  business_id text not null references public.businesses (business_id) on delete cascade,
  distance_meters integer not null,
  match_radius_meters integer not null,
  distance_method text not null,
  primary key (station_id, business_id),
  constraint station_businesses_nonnegative_distance check (distance_meters >= 0),
  constraint station_businesses_positive_radius check (match_radius_meters > 0),
  constraint station_businesses_within_radius check (
    distance_meters <= match_radius_meters
  )
);

create table public.osm_business_candidates (
  osm_object_type text not null,
  osm_object_id text not null,
  name text,
  address text,
  latitude double precision,
  longitude double precision,
  source text not null,
  license text,
  tags jsonb not null default '{}'::jsonb,
  validation_status text not null default 'candidate',
  primary key (osm_object_type, osm_object_id),
  constraint osm_business_candidates_object_type check (
    osm_object_type in ('node', 'way', 'relation')
  ),
  constraint osm_business_candidates_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint osm_business_candidates_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  constraint osm_business_candidates_coordinates_pair check (
    (latitude is null) = (longitude is null)
  )
);

create table public.station_osm_candidate_matches (
  station_id text not null references public.stations (station_id) on delete cascade,
  osm_object_type text not null,
  osm_object_id text not null,
  distance_meters integer not null,
  match_radius_meters integer not null,
  distance_method text not null,
  primary key (station_id, osm_object_type, osm_object_id),
  foreign key (osm_object_type, osm_object_id)
    references public.osm_business_candidates (osm_object_type, osm_object_id)
    on delete cascade,
  constraint station_osm_candidate_matches_nonnegative_distance check (
    distance_meters >= 0
  ),
  constraint station_osm_candidate_matches_positive_radius check (
    match_radius_meters > 0
  ),
  constraint station_osm_candidate_matches_within_radius check (
    distance_meters <= match_radius_meters
  )
);

create index station_businesses_station_distance_idx
  on public.station_businesses (station_id, distance_meters);
create index station_businesses_business_idx
  on public.station_businesses (business_id);
create index businesses_purchase_status_idx
  on public.businesses (purchase_status);
create index station_osm_candidate_matches_station_distance_idx
  on public.station_osm_candidate_matches (station_id, distance_meters);
create index station_osm_candidate_matches_candidate_idx
  on public.station_osm_candidate_matches (osm_object_type, osm_object_id);

alter table public.stations enable row level security;
alter table public.businesses enable row level security;
alter table public.station_businesses enable row level security;
alter table public.osm_business_candidates enable row level security;
alter table public.station_osm_candidate_matches enable row level security;

revoke all on public.stations, public.businesses, public.station_businesses
  from public, anon, authenticated;
revoke all on public.osm_business_candidates,
  public.station_osm_candidate_matches from public, anon, authenticated;
grant select on public.stations, public.businesses, public.station_businesses
  to anon, authenticated;
grant all on public.stations, public.businesses, public.station_businesses
  to service_role;
grant all on public.osm_business_candidates,
  public.station_osm_candidate_matches to service_role;

create policy stations_read_only
  on public.stations for select to anon, authenticated using (true);
create policy businesses_read_only
  on public.businesses for select to anon, authenticated using (true);
create policy station_businesses_read_only
  on public.station_businesses for select to anon, authenticated using (true);
