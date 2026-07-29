import twilio from "twilio";

/**
 * Twilio WhatsApp send + inbound signature validation.
 *
 * Deliberately best-effort on the send side: an unconfigured or failing
 * Twilio call must never break `draft_followup`'s write path. Local dev and
 * `npm run verify` never set these env vars, and that has to keep behaving
 * exactly as it did before this file existed -- the compliance gate is what
 * is load-bearing here, not delivery.
 */

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM,
  );
}

let cachedClient: ReturnType<typeof twilio> | null = null;

function getClient(): ReturnType<typeof twilio> | null {
  if (!isTwilioConfigured()) return null;
  if (!cachedClient) {
    cachedClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return cachedClient;
}

export interface SendResult {
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string;
  error?: string;
}

/** Best-effort WhatsApp send. Never throws. */
export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const client = getClient();
  if (!client) return { status: "skipped" };

  try {
    const from = process.env.TWILIO_WHATSAPP_FROM!.replace(/^whatsapp:/, "");
    const message = await client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${to}`,
      body,
    });
    return { status: "sent", providerMessageId: message.sid };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Validates the `X-Twilio-Signature` header on an inbound webhook request. */
export function isValidTwilioRequest(opts: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !opts.signature) return false;
  return twilio.validateRequest(token, opts.signature, opts.url, opts.params);
}
