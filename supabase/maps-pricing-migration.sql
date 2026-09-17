-- CABSY openrouteservice + verified distance fare migration. Run once AFTER schema.sql.
-- New bookings must be created through create-route-booking Edge Function.

alter table public.bookings
  add column if not exists pickup_place_id text,
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists drop_place_id text,
  add column if not exists drop_lat double precision,
  add column if not exists drop_lng double precision,
  add column if not exists distance_meters integer,
  add column if not exists distance_km numeric(10,3),
  add column if not exists estimated_duration_seconds integer,
  add column if not exists rate_per_km numeric(10,2);

-- Existing legacy bookings remain intact. New road-route bookings use exactly these types.
alter table public.bookings drop constraint if exists bookings_vehicle_check;
alter table public.bookings add constraint bookings_vehicle_check
  check (vehicle in ('sedan', 'suv', 'premium', 'ertiga', 'innova', 'urbania', 'tempo'));

-- Do not permit browser clients to insert a fare or booking directly.
drop policy if exists "Users create own bookings" on public.bookings;

-- Keep a customer cancellation path, but preserve all verified route snapshot fields.
create or replace function public.guard_customer_booking_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() = old.user_id then
    if new.status <> 'cancelled' or old.status <> 'pending' then
      raise exception 'Customers may only cancel pending bookings';
    end if;
    if new.user_id <> old.user_id or new.name <> old.name or new.phone <> old.phone
       or new.pickup <> old.pickup or new.destination <> old.destination
       or new.travel_date <> old.travel_date or new.travel_time <> old.travel_time
       or new.vehicle <> old.vehicle or new.passenger_count <> old.passenger_count
       or new.fare <> old.fare or new.special_instructions is distinct from old.special_instructions
       or new.pickup_place_id is distinct from old.pickup_place_id
       or new.drop_place_id is distinct from old.drop_place_id
       or new.pickup_lat is distinct from old.pickup_lat or new.pickup_lng is distinct from old.pickup_lng
       or new.drop_lat is distinct from old.drop_lat or new.drop_lng is distinct from old.drop_lng
       or new.distance_meters is distinct from old.distance_meters
       or new.distance_km is distinct from old.distance_km
       or new.estimated_duration_seconds is distinct from old.estimated_duration_seconds
       or new.rate_per_km is distinct from old.rate_per_km then
      raise exception 'Booking details cannot be changed after submission';
    end if;
  end if;
  return new;
end; $$;

-- Service-role Edge Functions supply a verified user_id. Browser direct inserts are blocked by RLS.
create or replace function public.set_booking_reference()
returns trigger language plpgsql as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  if new.user_id is null then raise exception 'Authenticated user required'; end if;
  if new.booking_reference is null or new.booking_reference = '' then
    new.booking_reference := 'CAB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end; $$;

comment on column public.bookings.distance_meters is 'openrouteservice actual driving distance verified server-side at booking time';
comment on column public.bookings.rate_per_km is 'Verified CABSY route rate snapshot in INR/km';
