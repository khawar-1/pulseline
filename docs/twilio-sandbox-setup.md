# Twilio WhatsApp Sandbox setup

This app sends and receives real WhatsApp messages through the **Twilio
WhatsApp Sandbox**, not the fully-approved WhatsApp Business API. That's a
deliberate scope call, not an oversight: full Business API access requires
Meta business verification and message-template approval, which is a
multi-day-to-multi-week process and not achievable for a weekend build. The
Sandbox exchanges genuinely real WhatsApp messages over Twilio's
infrastructure -- this is real sending and receiving, just gated behind a
one-time opt-in per phone number rather than a business-verified sender.
State this plainly in the demo narration.

## One-time setup

1. **Console.twilio.com** -> Messaging -> Try it out -> Send a WhatsApp
   message. Note the Sandbox number (a shared Twilio number, e.g.
   `+1 415 523 8886`) and your account's unique join code (e.g. `join
   apple-tiger`).

2. **Join the sandbox** from the phone you'll use for the demo: send the join
   code as a WhatsApp message to the Sandbox number. This authorization is
   what lets Twilio deliver messages to that number -- **it lapses after
   roughly 72 hours**, so re-send it the morning of the recording.

3. **Point inbound messages at the app**: Sandbox settings -> "When a
   message comes in" -> `https://<your-app>.vercel.app/api/webhooks/twilio`,
   method `POST`.

4. **Env vars**: copy the Account SID and Auth Token from the Console
   dashboard into `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. Set
   `TWILIO_WHATSAPP_FROM` to the Sandbox number (no `whatsapp:` prefix --
   the app adds that). Set `PUBLIC_BASE_URL` to the exact same origin
   configured in step 3; Twilio's signature validation fails if these don't
   match byte-for-byte.

## Before every recording take

- Re-send the join code if it's been more than ~72 hours since the last one.
- Confirm `PUBLIC_BASE_URL` matches the live Vercel URL, not a stale preview
  or a rotated `ngrok` tunnel.
- Re-run `supabase/seed.sql` so the live-demo campaign starts at zero leads.
- Do one full dry-run submission before the real take -- Twilio delivery
  failures show up as `dispatch_status='failed'` in the `followups` table
  with zero visible symptom beyond "no message arrived," so it's worth
  confirming a message actually lands before recording.
