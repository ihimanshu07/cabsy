// Secure Supabase Edge Function for database-webhook notifications.
// Required Supabase secrets: RESEND_API_KEY, RESEND_FROM_EMAIL,
// ADMIN_NOTIFICATION_EMAIL, WEBHOOK_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are Supabase-managed Edge Function secrets.
// The service role is used only inside this function to read the booking owner's email.
declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
  env: { get(name: string): string | undefined };
};

type BookingRecord = Record<string, unknown> & { user_id?: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));

async function sendEmail(to: string | string[], subject: string, html: string) {
  const recipients = (Array.isArray(to) ? to : to.split(',')).map(email => email.trim()).filter(Boolean);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: recipients, subject, html })
  });
  if (!response.ok) throw new Error(await response.text());
}

async function getBookingCustomerEmail(record: BookingRecord): Promise<string | null> {
  if (!record.user_id) return null;
  const url = new URL('/rest/v1/profiles', Deno.env.get('SUPABASE_URL'));
  url.searchParams.set('select', 'email');
  url.searchParams.set('id', `eq.${record.user_id}`);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(url, {
    headers: { apikey: serviceKey ?? '', authorization: `Bearer ${serviceKey ?? ''}` }
  });
  if (!response.ok) throw new Error(`Unable to read booking email: ${await response.text()}`);
  const profiles = await response.json() as Array<{ email?: string }>;
  return profiles[0]?.email ?? null;
}

function bookingDetails(record: BookingRecord) {
  return `<p><strong>Booking reference:</strong> ${escapeHtml(record.booking_reference)}</p>
    <p><strong>Customer:</strong> ${escapeHtml(record.name)}<br><strong>Phone:</strong> ${escapeHtml(record.phone)}</p>
    <p><strong>Pickup:</strong> ${escapeHtml(record.pickup)}<br><strong>Destination:</strong> ${escapeHtml(record.destination)}</p>
    <p><strong>Travel date:</strong> ${escapeHtml(record.travel_date)}<br><strong>Travel time:</strong> ${escapeHtml(record.travel_time)}<br><strong>Vehicle:</strong> ${escapeHtml(record.vehicle)}<br><strong>Passengers:</strong> ${escapeHtml(record.passenger_count)}<br><strong>Estimated fare:</strong> ₹${escapeHtml(record.fare)}</p>`;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('x-cabsy-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return json({ error: 'Unauthorized' }, 401);

  try {
    const event = await request.json();
    const record = (event.record ?? {}) as BookingRecord;
    const oldRecord = (event.old_record ?? {}) as BookingRecord;
    const table = event.table;
    const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');
    if (!adminEmail) throw new Error('ADMIN_NOTIFICATION_EMAIL is not configured');

    if (table === 'bookings' && event.type === 'INSERT') {
      const customerEmail = await getBookingCustomerEmail(record);
      const details = bookingDetails(record);
      await sendEmail(adminEmail, `New CABSY booking: ${record.booking_reference}`, `<h2>New CABSY Booking Request</h2>${details}<p><strong>Customer email:</strong> ${escapeHtml(customerEmail ?? 'Not available')}<br><strong>Status:</strong> Pending</p>`);
      if (customerEmail) {
        await sendEmail(customerEmail, `CABSY booking request received: ${record.booking_reference}`, `<h2>We received your CABSY booking request</h2><p>Hello ${escapeHtml(record.name)},</p><p>Your request has been recorded with status <strong>Pending</strong>. A submitted request is not a confirmed ride until CABSY contacts you.</p>${details}<p>Keep your booking reference for future communication: <strong>${escapeHtml(record.booking_reference)}</strong>.</p>`);
      }
      return json({ delivered: true, customerEmailSent: Boolean(customerEmail) });
    }

    if (table === 'bookings' && event.type === 'UPDATE' && oldRecord.status === 'pending' && record.status === 'cancelled') {
      const customerEmail = await getBookingCustomerEmail(record);
      const details = bookingDetails(record);
      await sendEmail(adminEmail, `CABSY booking cancelled: ${record.booking_reference}`, `<h2>CABSY Booking Cancelled</h2>${details}`);
      if (customerEmail) await sendEmail(customerEmail, `CABSY booking cancelled: ${record.booking_reference}`, `<h2>Your CABSY booking was cancelled</h2><p>Hello ${escapeHtml(record.name)},</p><p>Your booking request has been marked as cancelled.</p>${details}`);
      return json({ delivered: true, customerEmailSent: Boolean(customerEmail) });
    }

    if (table === 'driver_applications' && event.type === 'INSERT') {
      await sendEmail(adminEmail, 'New CABSY driver application', `<h2>New Driver Application</h2><p><strong>Name:</strong> ${escapeHtml(record.full_name)}<br><strong>Phone:</strong> ${escapeHtml(record.phone)}<br><strong>Email:</strong> ${escapeHtml(record.email)}</p><p><strong>City:</strong> ${escapeHtml(record.city)}<br><strong>Experience:</strong> ${escapeHtml(record.experience)}<br><strong>Vehicle:</strong> ${escapeHtml(record.vehicle_type)}</p>`);
      return json({ delivered: true });
    }

    if (table === 'contact_messages' && event.type === 'INSERT') {
      await sendEmail(adminEmail, 'New CABSY contact message', `<h2>New Contact Message</h2><p><strong>From:</strong> ${escapeHtml(record.name)} (${escapeHtml(record.email)})</p><p>${escapeHtml(record.message)}</p>`);
      return json({ delivered: true });
    }

    return json({ ignored: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Notification delivery failed' }, 502);
  }
});
