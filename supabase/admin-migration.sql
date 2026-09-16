-- CABSY secure staff/admin migration. Run once AFTER supabase/schema.sql.
-- Never assign an admin role from browser code. Initial role assignment is at the end.

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Security-definer helper: callers can learn only whether THEY are an admin.
-- It is deliberately the sole role check used by RLS policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Staff can see their own assigned role but cannot grant roles to themselves.
create policy "Users read own staff role"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

-- Authorized admins can read/update operational records. Customer policies remain in place.
-- Staff cannot insert or delete customer bookings through this role.
create policy "Admins read bookings"
on public.bookings for select to authenticated
using (public.is_admin());

create policy "Admins update bookings"
on public.bookings for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins read contact messages"
on public.contact_messages for select to authenticated
using (public.is_admin());

create policy "Admins update contact messages"
on public.contact_messages for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins read driver applications"
on public.driver_applications for select to authenticated
using (public.is_admin());

create policy "Admins update driver applications"
on public.driver_applications for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- INITIAL ADMIN SETUP (run this separately after replacing the UUID):
-- insert into public.user_roles (user_id, role)
-- values ('YOUR_AUTH_USER_UUID', 'admin');
-- Find the UUID in Supabase Dashboard → Authentication → Users.
