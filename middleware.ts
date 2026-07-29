import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth in front of the whole app.
 *
 * This product went from "synthetic-data demo, no auth needed" to "a real
 * chat interface, wired to real tools, sitting on a public Vercel URL"
 * without ever adding access control. Anyone with the link can currently
 * type directly into the agent -- read every lead's PII, create campaigns,
 * or try to get it to recite its system prompt / internal rules / file
 * layout. That's a real exposure, not a demo nitpick.
 *
 * Deliberately app-level Basic Auth rather than Vercel's built-in deployment
 * password, which is a Pro-plan feature this project doesn't have. Excludes
 * /api/webhooks/*: those already carry their own auth (a shared secret
 * header for the forms webhook, Twilio's request signature for the reply
 * webhook) and have to stay reachable by Google Apps Script / Twilio without
 * a browser-style login prompt, which neither of those callers can answer.
 *
 * Matches the rest of this app's "absence = safe no-op" convention: unset
 * SITE_USERNAME/SITE_PASSWORD leaves the app open, exactly as it is today.
 * That default is for local dev, not for the deployed URL -- set both on
 * Vercel before sharing the link.
 */
export const config = {
  matcher: ["/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(request: NextRequest) {
  const user = process.env.SITE_USERNAME;
  const pass = process.env.SITE_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPass = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Pulseline"' },
  });
}
