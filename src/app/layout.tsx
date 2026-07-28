import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";

import "./globals.css";

/**
 * Instrument Serif carries the wordmark, section headings and the KPI numerals
 * — high-contrast lining figures are what make a number look considered rather
 * than generated. Plex reads as technical instrumentation where a grotesque
 * would read as a SaaS marketing page, and it ships with a matched mono for
 * lead ids, timestamps and raw payloads.
 */
const display = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pulseline — lead-to-booking copilot",
  description:
    "Parses inbound patient leads, scores booking likelihood against a practice playbook, and drafts follow-ups that cannot reach a patient without passing compliance review.",
};

export const viewport: Viewport = {
  themeColor: "#f2f4f6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <body className="h-full overflow-hidden bg-paper text-ink">{children}</body>
    </html>
  );
}
