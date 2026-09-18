-- CABSY Google OAuth profile compatibility migration.
-- The existing auth.users trigger remains the only profile-creation mechanism.
-- Google-authenticated users are not assigned any staff role by this migration.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(split_part(new.email, '@', 1)), ''),
    'CABSY Customer'
  );

  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    case when char_length(candidate_name) >= 2 then candidate_name else 'CABSY Customer' end,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is 'Creates a default CABSY profile for every Supabase Auth user, including OAuth users; does not grant roles.';
