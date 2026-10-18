alter table public.businesses
  add column osm_object_type text,
  add column osm_object_id text,
  add column opening_hours text,
  add column opening_hours_source text,
  add column opening_hours_source_url text,
  add column opening_hours_license text,
  add column opening_hours_checked_at timestamptz,
  add constraint businesses_osm_object_type_check
    check (osm_object_type is null or osm_object_type in ('node', 'way', 'relation')),
  add constraint businesses_osm_object_reference_pair_check
    check ((osm_object_type is null) = (osm_object_id is null));

comment on column public.businesses.opening_hours is
  'Verbatim OpenStreetMap opening_hours value; NULL when OSM provides none.';
comment on column public.businesses.opening_hours_source is
  'Source name for the separately enriched opening_hours value.';
comment on column public.businesses.opening_hours_license is
  'License for the separately enriched opening_hours value.';
comment on column public.businesses.opening_hours_checked_at is
  'UTC time when the referenced OSM object was last checked.';
