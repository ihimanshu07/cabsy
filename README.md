# CABSY

CABSY is a static, modular cab-booking frontend backed by Supabase Auth and PostgreSQL. It provides real account flows, RLS-protected profiles and bookings, booking cancellation, private contact/driver submissions, and a prepared WhatsApp booking handoff.

## Features

- Responsive public website, booking widget, fares, services, destination ideas, legal pages, and contact page
- Supabase email/password sign-up, login, logout, verification guidance, session persistence, password reset, and protected pages
- Customer-owned profiles and bookings enforced with Row Level Security
- Database-generated customer booking references such as `CAB-8F3K92AB`
- Server-side vehicle fare and capacity validation for the configured fleet
- Booking history, filters, details, and pending-only cancellation
- Private contact messages and driver applications
- RLS-protected operations dashboard for explicitly assigned CABSY admins
- Secure Edge Function template for email notifications through Resend
- No service-role key, manually stored passwords, fake authentication, or localStorage authentication

## Project structure

```text
index.html                    Homepage and booking form
css/                          Global and page-level styles
js/                           Native ES modules
supabase/schema.sql           Executable PostgreSQL schema, triggers, RLS
assets/                       Reserved for replaceable approved brand imagery
supabase/admin-migration.sql  Secure admin role, RLS policies, and role setup
supabase/functions/           Edge Function for admin email notifications
admin.html                    Authorized-staff operations dashboard
```

## Supabase setup

1. Create a Supabase project.
2. In **Authentication → Providers**, enable Email authentication.
3. In **Authentication → URL Configuration**, add the deployment URL and local testing URL to redirect URLs. Include:
   - `http://localhost:PORT/auth.html`
   - `https://YOUR_DOMAIN/auth.html`
4. Copy the project URL and public anon/publishable key into `js/config.js`.
5. Run all of `supabase/schema.sql` in the Supabase SQL Editor.
6. Set `WHATSAPP_NUMBER` in `js/config.js` as digits-only international format, for example `919XXXXXXXXX`.
7. Replace `SITE_URL` and every `YOUR_*` business placeholder before launch.

Do not place a Supabase `service_role` key in this repository or frontend configuration.

## Auth configuration

With Supabase email confirmation enabled, sign-up shows verification guidance and the user receives an Auth-managed confirmation email. Password recovery uses Supabase’s recovery URL flow and returns to `auth.html?mode=reset`.

The client uses Supabase’s supported persisted session behavior (`persistSession`, token refresh, and URL detection). It does not implement its own browser authentication storage.

## Run locally

This is a static site. Use any static HTTP server rather than opening files directly, because browser ES modules need an HTTP origin. Examples:

```bash
python -m http.server 8080
# then open http://localhost:8080
```

Add the precise resulting `auth.html` URL to Supabase’s allowed redirect URLs.

## Test checklist

After configuring Supabase:

1. Sign up and verify the profile trigger created a `profiles` row.
2. Verify email if email confirmation is enabled; sign in and sign out.
3. Request a password reset and update the password through the emailed recovery link.
4. Use two different accounts. Ensure each can only see its own profile and bookings.
5. Submit a booking and verify database-generated reference, pending status, estimated fare, and WhatsApp CTA.
6. Attempt a booking with more passengers than the selected vehicle supports or a manually changed fare; PostgreSQL must reject it.
7. Confirm that only a pending booking can be cancelled by its owner.
8. Submit contact and driver forms; confirm neither table can be selected from the public/anon client.

## Operations dashboard and email notifications

### Secure admin dashboard

The operations dashboard is at `admin.html`, but it is **not** accessible merely by knowing the URL. Access requires an authenticated Supabase user with a database-assigned `admin` role.

1. Run `supabase/admin-migration.sql` once in the Supabase SQL Editor **after** `schema.sql`.
2. In **Authentication → Users**, copy the UUID of the account that should be the first CABSY administrator.
3. In SQL Editor, run this exact statement after replacing the placeholder:

```sql
insert into public.user_roles (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin');
```

4. Sign out and sign back in. The account dropdown will show **Operations Dashboard**.
5. Open `admin.html`. Admins can review bookings, driver applications, contact messages, and update their operational statuses. Non-admin users are redirected to the homepage and database RLS blocks their access.

Never create an admin rule in frontend JavaScript, and never let a customer insert into `user_roles`.

### Email notifications with Supabase + Resend

Emails are delivered by `supabase/functions/notify-admin/index.ts`, which must run as a Supabase Edge Function. The browser never receives the email API key.

1. Create a [Resend](https://resend.com) account, verify a sending domain/email, and create an API key.
2. Install and authenticate the Supabase CLI locally, then link it to this Supabase project.
3. Deploy the function:

```bash
supabase functions deploy notify-admin --no-verify-jwt
```

4. Set these function secrets—use real values, never commit them:

```bash
supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY
supabase secrets set RESEND_FROM_EMAIL="CABSY <notifications@YOUR_VERIFIED_DOMAIN>"
supabase secrets set ADMIN_NOTIFICATION_EMAIL="ADMIN_1_EMAIL,ADMIN_2_EMAIL"
supabase secrets set WEBHOOK_SECRET=CREATE_A_LONG_RANDOM_SECRET
```

5. In **Supabase Dashboard → Database → Webhooks**, create separate webhooks for:
   - `bookings` on `INSERT`
   - `bookings` on `UPDATE` (the function sends only pending → cancelled notices)
   - `driver_applications` on `INSERT`
   - `contact_messages` on `INSERT`

   For every webhook use:

```text
URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-admin
HTTP method: POST
Header: x-cabsy-webhook-secret: YOUR_WEBHOOK_SECRET
```

6. Create a test booking, driver application, and contact message. Confirm the respective email arrives at `ADMIN_NOTIFICATION_EMAIL`.

### Dashboard webhook fallback

If Dashboard → Database → Webhooks fails with `schema "supabase_functions" does not exist`, use `supabase/notification-webhooks.sql` instead of dashboard-created webhooks. Replace its single `YOUR_WEBHOOK_SECRET` placeholder with the exact value stored in the Edge Function secret, then run the whole file in Supabase SQL Editor. It uses `pg_net` to make the same authenticated HTTPS calls to `notify-admin`; it creates triggers for booking inserts/updates, driver application inserts, and contact-message inserts. Do not create duplicate dashboard webhooks after using this fallback.

For each new booking, the function securely reads the owner’s email from `profiles` using the **Edge Function’s server-only** Supabase service credentials. It sends:

- an operations email containing the booking and customer details to every comma-separated address in `ADMIN_NOTIFICATION_EMAIL`; and
- a separate booking-request receipt containing the booking details to the customer’s profile email.

A pending → cancelled booking change also sends a cancellation email to both the admin inbox and booking customer. Contact and driver notifications go to the admin inbox only.

Database webhooks transmit booking/customer data to the configured Edge Function and Resend. Use a business-controlled admin inbox and follow your finalized privacy policy.

## Deployment

The application can deploy directly to Netlify, Vercel, or GitHub Pages as a static site. Configure the host to serve `index.html` as the root page and include `404.html` where supported. Update Supabase Auth’s Site URL and redirect allow-list after deployment.

GitHub Pages is suitable for the static frontend but cannot safely host secrets or server-side business workflows. Supabase handles the backend data/auth capabilities here.

## Security notes

- RLS is mandatory: run the provided schema in full.
- The bookings table derives `user_id` from `auth.uid()` and rejects manipulated fares/capacities.
- The cancellation trigger only permits an authenticated customer to change their own pending booking to `cancelled`.
- Contact and driver inserts are intentionally public, but read access is not. Add CAPTCHA/rate limiting through an Edge Function or anti-abuse provider before a high-traffic launch.
- Do not treat WhatsApp opening as booking confirmation.

## Known limitations and recommended next steps

- Fare values are fixed estimates, not distance-based final prices.
- The site intentionally has no staff/admin interface. Build one with Supabase roles/claims or server-side authorization.
- Replace business placeholders, destination content, and visual assets with verified operational information.
- Add real maps/geocoding, operational confirmation workflow, notifications, payments, secure abuse prevention, and legal review before operating commercially.
