-- CABSY Supabase schema. Run this entire file in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  booking_reference text not null unique,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text not null,
  pickup text not null check (char_length(trim(pickup)) between 2 and 300),
  destination text not null check (char_length(trim(destination)) between 2 and 300),
  travel_date date not null,
  travel_time time not null,
  vehicle text not null check (vehicle in ('sedan','ertiga','innova','urbania','tempo')),
  passenger_count smallint not null check (passenger_count between 1 and 16),
  fare numeric(10,2) not null check (fare >= 0),
  special_instructions text,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lower(trim(pickup)) <> lower(trim(destination)))
);
create index bookings_user_id_idx on public.bookings(user_id);
create index bookings_status_idx on public.bookings(status);
create index bookings_travel_date_idx on public.bookings(travel_date);
create index bookings_reference_idx on public.bookings(booking_reference);
create index bookings_user_created_idx on public.bookings(user_id, created_at desc);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  email text not null,
  phone text,
  message text not null check (char_length(trim(message)) between 10 and 5000),
  status text not null default 'new' check (status in ('new','read','resolved')),
  created_at timestamptz not null default now()
);
create index contact_messages_created_at_idx on public.contact_messages(created_at desc);

create table public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null,
  email text not null,
  city text not null,
  experience text not null,
  vehicle_type text not null,
  vehicle_registration text not null,
  license_number text not null,
  message text,
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected')),
  created_at timestamptz not null default now()
);
create index driver_applications_status_idx on public.driver_applications(status);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), new.email);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute procedure public.set_updated_at();

-- Client-provided references are replaced by a database-generated customer reference.
create or replace function public.set_booking_reference()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  -- Pricing and capacity are enforced server-side, not trusted from a modified browser request.
  case new.vehicle
    when 'sedan' then
      if new.fare <> 850 or new.passenger_count > 4 then raise exception 'Invalid Prime Sedan fare or capacity'; end if;
    when 'ertiga' then
      if new.fare <> 1250 or new.passenger_count > 6 then raise exception 'Invalid Ertiga fare or capacity'; end if;
    when 'innova' then
      if new.fare <> 1550 or new.passenger_count > 6 then raise exception 'Invalid Innova Crysta fare or capacity'; end if;
    when 'urbania' then
      if new.fare <> 4000 or new.passenger_count > 16 then raise exception 'Invalid Urbania fare or capacity'; end if;
    when 'tempo' then
      if new.fare <> 4000 or new.passenger_count > 12 then raise exception 'Invalid Tempo Traveller fare or capacity'; end if;
  end case;
  new.booking_reference := 'CAB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  return new;
end; $$;
create trigger bookings_set_reference before insert on public.bookings for each row execute procedure public.set_booking_reference();

-- Customers may only transition their own pending booking to cancelled.
-- All other customer modifications are rejected even if a client bypasses the UI.
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
       or new.fare <> old.fare or new.special_instructions is distinct from old.special_instructions then
      raise exception 'Booking details cannot be changed after submission';
    end if;
  end if;
  return new;
end; $$;
create trigger bookings_guard_customer_update before update on public.bookings for each row execute procedure public.guard_customer_booking_update();

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.contact_messages enable row level security;
alter table public.driver_applications enable row level security;

-- Customers can only access their own profile and bookings. user_id is assigned by auth.uid() server-side.
create policy "Users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Users read own bookings" on public.bookings for select to authenticated using (user_id = auth.uid());
create policy "Users create own bookings" on public.bookings for insert to authenticated with check (user_id = auth.uid());
create policy "Users cancel own pending bookings" on public.bookings for update to authenticated using (user_id = auth.uid() and status = 'pending') with check (user_id = auth.uid() and status = 'cancelled');

-- Visitors may submit private messages/applications but cannot read, alter, or delete any submission.
create policy "Public can submit contact messages" on public.contact_messages for insert to anon, authenticated with check (true);
create policy "Public can submit driver applications" on public.driver_applications for insert to anon, authenticated with check (true);
