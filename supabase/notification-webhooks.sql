-- CABSY notification webhook fallback.
-- Use this ONLY if Supabase Dashboard → Database → Webhooks fails with
-- "schema supabase_functions does not exist".
--
-- Before running: replace YOUR_WEBHOOK_SECRET with the exact value stored in
-- Supabase Edge Function secret WEBHOOK_SECRET. Keep the value private.
-- This secret stays in PostgreSQL/server configuration and is never sent to the browser.

create extension if not exists pg_net;

create or replace function public.send_cabsy_notification()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  endpoint text := 'https://atqjamabdcsuvsutdkdv.supabase.co/functions/v1/notify-admin';
  webhook_secret text := '0064fc4e2c222368e37a633d730d0ec24648ce09dc36053a3b563e4d39b58ed9';
  payload jsonb;
  request_id bigint;
begin
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end,
    'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
  );

  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cabsy-webhook-secret', webhook_secret
    ),
    body := payload
  ) into request_id;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

-- Only the database triggers execute this function; browser roles cannot call it directly.
revoke all on function public.send_cabsy_notification() from public;

-- Drop/recreate so the file can be rerun safely if a trigger setup attempt was interrupted.
drop trigger if exists cabsy_booking_insert_notification on public.bookings;
drop trigger if exists cabsy_booking_update_notification on public.bookings;
drop trigger if exists cabsy_driver_insert_notification on public.driver_applications;
drop trigger if exists cabsy_contact_insert_notification on public.contact_messages;

create trigger cabsy_booking_insert_notification
after insert on public.bookings
for each row execute function public.send_cabsy_notification();

create trigger cabsy_booking_update_notification
after update on public.bookings
for each row execute function public.send_cabsy_notification();

create trigger cabsy_driver_insert_notification
after insert on public.driver_applications
for each row execute function public.send_cabsy_notification();

create trigger cabsy_contact_insert_notification
after insert on public.contact_messages
for each row execute function public.send_cabsy_notification();
